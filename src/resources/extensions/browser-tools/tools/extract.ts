import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ToolDeps } from "../state.js";

/**
 * Structured data extraction with JSON Schema validation.
 */

export function registerExtractTools(pi: ExtensionAPI, deps: ToolDeps): void {
	pi.registerTool({
		name: "browser_extract",
		label: "Browser Extract",
		description:
			"Extract structured data from the current page using CSS selectors and validate against a JSON Schema. " +
			"Provide a schema describing the shape of data you want. The tool extracts data by evaluating " +
			"CSS selectors in the page context, then validates the result against your schema. " +
			"Supports extracting single objects or arrays of items. Waits for network idle before extraction.",
		parameters: Type.Object({
			schema: Type.Record(Type.String(), Type.Unknown(), {
				description:
					"JSON Schema describing the data shape to extract. Properties should include " +
					"'_selector' (CSS selector) and '_attribute' (attribute to read, default: 'textContent') hints. " +
					"Example: { type: 'object', properties: { title: { _selector: 'h1', _attribute: 'textContent' }, price: { _selector: '.price', _attribute: 'textContent' } } }",
			}),
			selector: Type.Optional(
				Type.String({ description: "CSS selector to scope extraction to a specific container element." }),
			),
			multiple: Type.Optional(
				Type.Boolean({
					description:
						"If true, extract an array of items. The 'selector' parameter becomes the item container selector, " +
						"and schema properties are extracted relative to each matched container.",
				}),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const { page: p } = await deps.ensureBrowser();

				// Wait for network idle before extraction
				await p.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => { /* networkidle timeout — non-fatal, page may still be usable */ });

				const schema = params.schema as any;
				const scopeSelector = params.selector;
				const multiple = params.multiple ?? false;

				// Build extraction plan from schema
				const extractionPlan = buildExtractionPlan(schema);

				// Execute extraction in page context
				const rawData = await p.evaluate(
					({ plan, scope, multi }: { plan: ExtractionField[]; scope: string | undefined; multi: boolean }) => {
						function extractFromContainer(container: Element, fields: typeof plan): Record<string, unknown> {
							const result: Record<string, unknown> = {};
							for (const field of fields) {
								const el = container.querySelector(field.selector);
								if (!el) {
									result[field.name] = null;
									continue;
								}
								let value: unknown;
								switch (field.attribute) {
									case "textContent":
										value = (el.textContent ?? "").trim();
										break;
									case "innerText":
										value = ((el as HTMLElement).innerText ?? "").trim();
										break;
									case "innerHTML":
										value = el.innerHTML;
										break;
									case "href":
										value = (el as HTMLAnchorElement).href ?? el.getAttribute("href");
										break;
									case "src":
										value = (el as HTMLImageElement).src ?? el.getAttribute("src");
										break;
									case "value":
										value = (el as HTMLInputElement).value;
										break;
									default:
										value = el.getAttribute(field.attribute) ?? (el.textContent ?? "").trim();
								}
								// Type coercion
								if (field.type === "number" && typeof value === "string") {
									const num = parseFloat(value.replace(/[^0-9.-]/g, ""));
									value = isNaN(num) ? value : num;
								} else if (field.type === "boolean" && typeof value === "string") {
									value = value.toLowerCase() === "true" || value === "1";
								}
								result[field.name] = value;
							}
							return result;
						}

						const root = scope ? document.querySelector(scope) : document.body;
						if (!root) return { data: null, error: `Scope selector "${scope}" not found` };

						if (multi) {
							// For multiple items, scope is the item selector
							const containers = scope
								? document.querySelectorAll(scope)
								: [document.body];
							const items = Array.from(containers).map((container) =>
								extractFromContainer(container, plan),
							);
							return { data: items, error: null };
						} else {
							return { data: extractFromContainer(root, plan), error: null };
						}
					},
					{ plan: extractionPlan, scope: scopeSelector, multi: multiple },
				);

				if (rawData.error) {
					return {
						content: [{ type: "text", text: `Extraction failed: ${rawData.error}` }],
						details: { error: rawData.error },
						isError: true,
					};
				}

				// Validate against schema using ajv
				const validationErrors = await validateData(rawData.data, schema, multiple);

				const resultText = JSON.stringify(rawData.data, null, 2);
				const truncated = resultText.length > 4000 ? resultText.slice(0, 4000) + "\n...(truncated)" : resultText;

				return {
					content: [{
						type: "text",
						text: validationErrors.length > 0
							? `Extracted data (with ${validationErrors.length} validation warning(s)):\n${truncated}\n\nValidation warnings:\n${validationErrors.join("\n")}`
							: `Extracted data:\n${truncated}`,
					}],
					details: {
						data: rawData.data,
						validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
						fieldCount: extractionPlan.length,
						itemCount: multiple ? (rawData.data as any[])?.length ?? 0 : 1,
					},
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Extraction failed: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});
}

interface ExtractionField {
	name: string;
	selector: string;
	attribute: string;
	type: string;
}

function buildExtractionPlan(schema: any): ExtractionField[] {
	const fields: ExtractionField[] = [];

	if (!schema || typeof schema !== "object") return fields;

	const properties = schema.properties ?? schema;

	for (const [name, propSchema] of Object.entries(properties)) {
		const prop = propSchema as any;
		if (!prop || typeof prop !== "object") continue;

		// Skip meta fields
		if (name === "type" || name === "required" || name === "properties" || name === "$schema") continue;

		const selector = prop._selector ?? prop.selector ?? `[data-field="${name}"], .${name}, #${name}`;
		const attribute = prop._attribute ?? prop.attribute ?? "textContent";
		const type = prop.type ?? "string";

		fields.push({ name, selector, attribute, type });
	}

	return fields;
}

async function validateData(data: unknown, schema: any, isArray: boolean): Promise<string[]> {
	const errors: string[] = [];

	try {
		const ajvModule = await import("ajv");
		const Ajv = ajvModule.default ?? ajvModule;
		const ajv = new (Ajv as any)({ allErrors: true, strict: false });

		// Clean schema — remove our custom _selector/_attribute hints before validation
		const cleanSchema = cleanSchemaForValidation(schema);

		// Wrap in array schema if multiple
		const validationSchema = isArray
			? { type: "array", items: cleanSchema }
			: cleanSchema;

		const validate = ajv.compile(validationSchema);
		const valid = validate(data);

		if (!valid && validate.errors) {
			for (const err of validate.errors) {
				errors.push(`${err.instancePath || "/"}: ${err.message}`);
			}
		}
	} catch (err: any) {
		errors.push(`Schema validation setup failed: ${err.message}`);
	}

	return errors;
}

function cleanSchemaForValidation(schema: any): any {
	if (!schema || typeof schema !== "object") return schema;
	if (Array.isArray(schema)) return schema.map(cleanSchemaForValidation);

	const cleaned: any = {};
	for (const [key, value] of Object.entries(schema)) {
		if (key.startsWith("_")) continue; // Remove our custom hints
		if (key === "selector" && typeof value === "string") continue; // Also remove plain 'selector'
		if (key === "attribute" && typeof value === "string") continue; // Also remove plain 'attribute'
		cleaned[key] = cleanSchemaForValidation(value);
	}
	return cleaned;
}
