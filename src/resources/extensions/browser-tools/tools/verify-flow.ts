/**
 * browser_verify_flow — structured flow verification with retry and debug bundle.
 *
 * Wraps `runBatchSteps()` from core.ts with:
 *   - flow-level metadata (name, verdict, duration)
 *   - per-step retry with configurable maxRetries and retryDelayMs
 *   - PASS/FAIL verdict
 *   - automatic debug bundle capture on FAIL (screenshot, console, network)
 *
 * Decisions: D007 (lives in browser-tools), D010 (structured step arrays),
 *            D014 (full debug bundle on failure), D024 (reuses runBatchSteps).
 */

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@gsd/pi-ai";
import path from "node:path";
import {
	runBatchSteps,
	evaluateAssertionChecks,
	validateWaitParams,
	createRegionStableScript,
	parseThreshold,
	includesNeedle,
} from "../core.js";
import type { ToolDeps } from "../state.js";
import {
	ARTIFACT_ROOT,
	getConsoleLogs,
	getNetworkLogs,
	getDialogLogs,
	getActionTimeline,
	getCurrentRefMap,
} from "../state.js";
import { ensureDir } from "../utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlowRetryPolicy {
	maxRetries?: number;
	retryDelayMs?: number;
}

export interface FlowStepInput {
	action: string;
	selector?: string;
	text?: string;
	url?: string;
	key?: string;
	condition?: string;
	value?: string;
	threshold?: string;
	timeout?: number;
	clearFirst?: boolean;
	submit?: boolean;
	ref?: string;
	checks?: Array<{
		kind: string;
		selector?: string;
		text?: string;
		value?: string;
		checked?: boolean;
		sinceActionId?: number;
	}>;
	retries?: number; // per-step retry override
}

export interface FlowStepResult {
	index: number;
	action: string;
	ok: boolean;
	attempts: number;
	error?: string;
	details?: Record<string, unknown>;
}

export interface FlowResult {
	verdict: "PASS" | "FAIL";
	name: string;
	stepResults: FlowStepResult[];
	failedStepIndex: number | null;
	debugBundle?: { dir: string; artifacts: Record<string, unknown> };
	totalDurationMs: number;
}

export interface FlowParams {
	name: string;
	steps: FlowStepInput[];
	retryPolicy?: FlowRetryPolicy;
	baseUrl?: string;
}

// ---------------------------------------------------------------------------
// runVerifyFlow — exported for programmatic use (S04)
// ---------------------------------------------------------------------------

export async function runVerifyFlow(deps: ToolDeps, params: FlowParams): Promise<FlowResult> {
	const startTime = Date.now();
	const maxRetries = params.retryPolicy?.maxRetries ?? 0;
	const retryDelayMs = params.retryPolicy?.retryDelayMs ?? 500;

	// If baseUrl is provided, prepend a navigate step
	const steps: FlowStepInput[] = params.baseUrl
		? [{ action: "navigate", url: params.baseUrl }, ...params.steps]
		: [...params.steps];

	const { page: p } = await deps.ensureBrowser();
	const currentUrl = deps.getActivePageOrNull()?.url() ?? "";
	const actionEntry = deps.beginTrackedAction("browser_verify_flow", params, currentUrl);
	const actionId = actionEntry.id;

	const flowStepResults: FlowStepResult[] = [];

	// Build a single-step executor with retry logic, then pass to runBatchSteps
	const executeStep = async (step: FlowStepInput, index: number): Promise<{ ok: boolean; [key: string]: unknown }> => {
		const stepMaxRetries = step.retries ?? maxRetries;
		let lastError: string | undefined;
		let attempts = 0;

		for (let attempt = 0; attempt <= stepMaxRetries; attempt++) {
			attempts = attempt + 1;
			if (attempt > 0) {
				await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
			}

			const result = await executeSingleStep(deps, p, step);
			if (result.ok) {
				flowStepResults.push({
					index,
					action: step.action,
					ok: true,
					attempts,
					details: result as Record<string, unknown>,
				});
				return result;
			}

			lastError = result.message ?? result.error ?? "Step failed";

			// If retries remain, continue the loop
			if (attempt < stepMaxRetries) continue;

			// Final attempt failed
			flowStepResults.push({
				index,
				action: step.action,
				ok: false,
				attempts,
				error: lastError,
				details: result as Record<string, unknown>,
			});
			return result;
		}

		// Unreachable, but satisfy TS
		return { ok: false, message: lastError };
	};

	const batchResult = await runBatchSteps({
		steps,
		executeStep,
		stopOnFailure: true,
	});

	// Fill in results for steps that weren't reached (after a stop)
	for (let i = flowStepResults.length; i < steps.length; i++) {
		flowStepResults.push({
			index: i,
			action: steps[i].action,
			ok: false,
			attempts: 0,
			error: "Not reached (prior step failed)",
		});
	}

	const verdict: "PASS" | "FAIL" = batchResult.ok ? "PASS" : "FAIL";
	const failedStepIndex = batchResult.failedStepIndex;

	let debugBundle: FlowResult["debugBundle"] | undefined;

	// On FAIL: capture debug bundle
	if (verdict === "FAIL") {
		try {
			debugBundle = await captureFlowDebugBundle(deps, params.name);
		} catch {
			// Debug bundle capture is best-effort; don't mask the real failure
		}
	}

	const totalDurationMs = Date.now() - startTime;

	// Finish tracked action
	deps.finishTrackedAction(actionId, {
		status: verdict === "PASS" ? "success" : "error",
		afterUrl: deps.getActivePageOrNull()?.url() ?? "",
		verificationSummary: `${verdict}: ${flowStepResults.filter((r) => r.ok).length}/${steps.length} steps passed`,
		error: verdict === "FAIL" ? `Flow "${params.name}" failed at step ${failedStepIndex !== null ? failedStepIndex + 1 : "?"}` : undefined,
	});

	return {
		verdict,
		name: params.name,
		stepResults: flowStepResults,
		failedStepIndex,
		debugBundle,
		totalDurationMs,
	};
}

// ---------------------------------------------------------------------------
// Single-step executor — mirrors browser_batch's executeStep switch/case
// ---------------------------------------------------------------------------

async function executeSingleStep(
	deps: ToolDeps,
	p: import("playwright").Page,
	step: FlowStepInput,
): Promise<{ ok: boolean; [key: string]: unknown }> {
	const stepTarget = deps.getActiveTarget();
	try {
		switch (step.action) {
			case "navigate": {
				await p.goto(step.url!, { waitUntil: "domcontentloaded", timeout: 30000 });
				await p.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
				return { ok: true, action: step.action, url: p.url() };
			}
			case "click": {
				await stepTarget.locator(step.selector!).first().click({ timeout: step.timeout ?? 8000 });
				await deps.settleAfterActionAdaptive(p);
				return { ok: true, action: step.action, selector: step.selector, url: p.url() };
			}
			case "type": {
				if (step.clearFirst) {
					await stepTarget.locator(step.selector!).first().fill("");
				}
				await stepTarget.locator(step.selector!).first().fill(step.text ?? "", { timeout: step.timeout ?? 8000 });
				if (step.submit) await p.keyboard.press("Enter");
				await deps.settleAfterActionAdaptive(p);
				return { ok: true, action: step.action, selector: step.selector, text: step.text };
			}
			case "key_press": {
				await p.keyboard.press(step.key!);
				await deps.settleAfterActionAdaptive(p, { checkFocusStability: true });
				return { ok: true, action: step.action, key: step.key };
			}
			case "wait_for": {
				const timeout = step.timeout ?? 10000;
				const waitValidation = validateWaitParams({ condition: step.condition!, value: step.value, threshold: step.threshold });
				if (waitValidation) throw new Error(waitValidation.error);

				if (step.condition === "selector_visible") await stepTarget.waitForSelector(step.value!, { state: "visible", timeout });
				else if (step.condition === "selector_hidden") await stepTarget.waitForSelector(step.value!, { state: "hidden", timeout });
				else if (step.condition === "url_contains") await p.waitForURL((url) => url.toString().includes(step.value!), { timeout });
				else if (step.condition === "network_idle") await p.waitForLoadState("networkidle", { timeout });
				else if (step.condition === "delay") await new Promise((resolve) => setTimeout(resolve, parseInt(step.value ?? "1000", 10)));
				else if (step.condition === "text_visible") {
					await stepTarget.waitForFunction(
						(needle: string) => (document.body?.innerText ?? "").toLowerCase().includes(needle.toLowerCase()),
						step.value!,
						{ timeout },
					);
				}
				else if (step.condition === "text_hidden") {
					await stepTarget.waitForFunction(
						(needle: string) => !(document.body?.innerText ?? "").toLowerCase().includes(needle.toLowerCase()),
						step.value!,
						{ timeout },
					);
				}
				else if (step.condition === "request_completed") {
					await deps.getActivePage().waitForResponse(
						(resp: any) => resp.url().includes(step.value!),
						{ timeout },
					);
				}
				else if (step.condition === "console_message") {
					const needle = step.value!;
					const startTime = Date.now();
					let found = false;
					while (Date.now() - startTime < timeout) {
						if (getConsoleLogs().find((entry) => includesNeedle(entry.text, needle))) { found = true; break; }
						await new Promise((resolve) => setTimeout(resolve, 100));
					}
					if (!found) throw new Error(`Timed out waiting for console message matching "${needle}" (${timeout}ms)`);
				}
				else if (step.condition === "element_count") {
					const threshold = parseThreshold(step.threshold ?? ">=1");
					if (!threshold) throw new Error(`element_count threshold is malformed: "${step.threshold}"`);
					const selector = step.value!;
					const op = threshold.op;
					const n = threshold.n;
					await stepTarget.waitForFunction(
						({ selector, op, n }: { selector: string; op: string; n: number }) => {
							const count = document.querySelectorAll(selector).length;
							switch (op) {
								case ">=": return count >= n;
								case "<=": return count <= n;
								case "==": return count === n;
								case ">": return count > n;
								case "<": return count < n;
								default: return false;
							}
						},
						{ selector, op, n },
						{ timeout },
					);
				}
				else if (step.condition === "region_stable") {
					const script = createRegionStableScript(step.value!);
					await stepTarget.waitForFunction(script, undefined, { timeout, polling: 200 });
				}
				else throw new Error(`Unsupported wait condition: ${step.condition}`);
				return { ok: true, action: step.action, condition: step.condition, value: step.value };
			}
			case "assert": {
				const state = await deps.collectAssertionState(p, step.checks ?? [], stepTarget);
				const assertion = evaluateAssertionChecks({ checks: step.checks ?? [], state });
				return { ok: assertion.verified, action: step.action, summary: assertion.summary, assertion };
			}
			case "click_ref": {
				const parsedRef = deps.parseRef(step.ref!);
				const currentRefMap = getCurrentRefMap();
				const node = currentRefMap[parsedRef.key];
				if (!node) throw new Error(`Unknown ref: ${step.ref}`);
				const resolved = await deps.resolveRefTarget(stepTarget, node);
				if (!resolved.ok) throw new Error(resolved.reason);
				await stepTarget.locator(resolved.selector).first().click({ timeout: step.timeout ?? 8000 });
				await deps.settleAfterActionAdaptive(p);
				return { ok: true, action: step.action, ref: step.ref };
			}
			case "fill_ref": {
				const parsedRef = deps.parseRef(step.ref!);
				const currentRefMap = getCurrentRefMap();
				const node = currentRefMap[parsedRef.key];
				if (!node) throw new Error(`Unknown ref: ${step.ref}`);
				const resolved = await deps.resolveRefTarget(stepTarget, node);
				if (!resolved.ok) throw new Error(resolved.reason);
				if (step.clearFirst) await stepTarget.locator(resolved.selector).first().fill("");
				await stepTarget.locator(resolved.selector).first().fill(step.text ?? "", { timeout: step.timeout ?? 8000 });
				if (step.submit) await p.keyboard.press("Enter");
				await deps.settleAfterActionAdaptive(p);
				return { ok: true, action: step.action, ref: step.ref, text: step.text };
			}
			default:
				throw new Error(`Unsupported flow action: ${step.action}`);
		}
	} catch (err: any) {
		return { ok: false, action: step.action, message: err.message };
	}
}

// ---------------------------------------------------------------------------
// Debug bundle capture — mirrors browser_debug_bundle from session.ts
// ---------------------------------------------------------------------------

async function captureFlowDebugBundle(
	deps: ToolDeps,
	flowName: string,
): Promise<{ dir: string; artifacts: Record<string, unknown> }> {
	const p = deps.getActivePageOrNull();
	const bundleTimestamp = deps.formatArtifactTimestamp(Date.now());
	const safeName = deps.sanitizeArtifactName(flowName, "verify-flow");
	const bundleDir = path.join(ARTIFACT_ROOT, `${bundleTimestamp}-${safeName}`);
	await ensureDir(bundleDir);

	const consoleLogs = getConsoleLogs();
	const networkLogs = getNetworkLogs();
	const dialogLogs = getDialogLogs();

	const artifacts: Record<string, unknown> = {};

	// Screenshot (best-effort)
	if (p) {
		try {
			const screenshotPath = path.join(bundleDir, "screenshot.jpg");
			await p.screenshot({ path: screenshotPath, type: "jpeg", quality: 80, fullPage: false });
			artifacts.screenshot = screenshotPath;
		} catch {
			// screenshot may fail if page is crashed/navigating
		}
	}

	// Console logs
	artifacts.console = await deps.writeArtifactFile(
		path.join(bundleDir, "console.json"),
		JSON.stringify(consoleLogs, null, 2),
	);

	// Network logs
	artifacts.network = await deps.writeArtifactFile(
		path.join(bundleDir, "network.json"),
		JSON.stringify(networkLogs, null, 2),
	);

	// Dialog logs
	artifacts.dialog = await deps.writeArtifactFile(
		path.join(bundleDir, "dialog.json"),
		JSON.stringify(dialogLogs, null, 2),
	);

	// Timeline
	const actionTimeline = getActionTimeline();
	artifacts.timeline = await deps.writeArtifactFile(
		path.join(bundleDir, "timeline.json"),
		JSON.stringify(actionTimeline.entries, null, 2),
	);

	// Accessibility (best-effort)
	try {
		const accessibility = await deps.captureAccessibilityMarkdown();
		artifacts.accessibility = await deps.writeArtifactFile(
			path.join(bundleDir, "accessibility.md"),
			accessibility.snapshot,
		);
	} catch {
		// accessibility capture may fail
	}

	return { dir: bundleDir, artifacts };
}

// ---------------------------------------------------------------------------
// registerFlowTools — tool registration
// ---------------------------------------------------------------------------

const FlowCheckSchema = Type.Object({
	kind: Type.String({ description: "Assertion kind, e.g. url_contains, text_visible, selector_visible, value_equals, no_console_errors, no_failed_requests" }),
	selector: Type.Optional(Type.String()),
	text: Type.Optional(Type.String()),
	value: Type.Optional(Type.String()),
	checked: Type.Optional(Type.Boolean()),
	sinceActionId: Type.Optional(Type.Number()),
});

const FlowStepSchema = Type.Object({
	action: StringEnum(["navigate", "click", "type", "key_press", "wait_for", "assert", "click_ref", "fill_ref"] as const),
	selector: Type.Optional(Type.String()),
	text: Type.Optional(Type.String()),
	url: Type.Optional(Type.String()),
	key: Type.Optional(Type.String()),
	condition: Type.Optional(Type.String()),
	value: Type.Optional(Type.String()),
	threshold: Type.Optional(Type.String()),
	timeout: Type.Optional(Type.Number()),
	clearFirst: Type.Optional(Type.Boolean()),
	submit: Type.Optional(Type.Boolean()),
	ref: Type.Optional(Type.String()),
	checks: Type.Optional(Type.Array(FlowCheckSchema)),
	retries: Type.Optional(Type.Number({ description: "Per-step retry override. Defaults to retryPolicy.maxRetries." })),
});

const FlowRetryPolicySchema = Type.Object({
	maxRetries: Type.Optional(Type.Number({ description: "Maximum number of retries per step (default: 0)." })),
	retryDelayMs: Type.Optional(Type.Number({ description: "Delay in milliseconds between retries (default: 500)." })),
});

export function registerFlowTools(pi: ExtensionAPI, deps: ToolDeps): void {
	pi.registerTool({
		name: "browser_verify_flow",
		label: "Browser Verify Flow",
		description:
			"Execute a named verification flow: a sequence of browser steps with per-step retry, structured PASS/FAIL verdict, and automatic debug bundle capture on failure. Uses the same step format as browser_batch.",
		promptGuidelines: [
			"Use browser_verify_flow for multi-step verification sequences that need a clear PASS/FAIL outcome.",
			"Each step supports retry via retryPolicy (flow-level) or per-step retries field.",
			"On failure, a debug bundle (screenshot, console, network) is automatically captured.",
		],
		parameters: Type.Object({
			name: Type.String({ description: "Human-readable name for this flow (e.g. 'login-and-verify-dashboard')." }),
			steps: Type.Array(FlowStepSchema, { description: "Steps to execute sequentially. Same format as browser_batch steps." }),
			retryPolicy: Type.Optional(FlowRetryPolicySchema),
			baseUrl: Type.Optional(Type.String({ description: "If provided, a navigate step to this URL is prepended to the steps array." })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const result = await runVerifyFlow(deps, params);
				const stepLines = result.stepResults.map((r) =>
					`  ${r.index + 1}. ${r.action}: ${r.ok ? "PASS" : "FAIL"}${r.attempts > 1 ? ` (${r.attempts} attempts)` : ""}${r.error ? ` — ${r.error}` : ""}`,
				);
				const content = [
					`Flow "${result.name}": ${result.verdict} (${result.totalDurationMs}ms)`,
					...stepLines,
					result.debugBundle ? `\nDebug bundle: ${result.debugBundle.dir}` : "",
				].filter(Boolean).join("\n");

				return {
					content: [{ type: "text", text: content }],
					details: result,
					isError: result.verdict === "FAIL",
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Flow verification failed: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});
}
