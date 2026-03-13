import assert from "node:assert/strict";
import test from "node:test";
import { buildRequest } from "../../packages/pi-ai/dist/providers/google-gemini-cli.js";
import type { Model } from "../../packages/pi-ai/src/types.ts";

const antigravityClaudeModel: Model<"google-gemini-cli"> = {
	id: "claude-sonnet-4-5",
	name: "Claude Sonnet 4.5 (Antigravity)",
	api: "google-gemini-cli",
	provider: "google-antigravity",
	baseUrl: "https://daily-cloudcode-pa.sandbox.googleapis.com",
	reasoning: false,
	input: ["text", "image"],
	cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
	contextWindow: 200000,
	maxTokens: 64000,
};

const antigravityGeminiModel: Model<"google-gemini-cli"> = {
	id: "gemini-3-flash",
	name: "Gemini 3 Flash (Antigravity)",
	api: "google-gemini-cli",
	provider: "google-antigravity",
	baseUrl: "https://daily-cloudcode-pa.sandbox.googleapis.com",
	reasoning: true,
	input: ["text", "image"],
	cost: { input: 0.5, output: 3, cacheRead: 0.5, cacheWrite: 0 },
	contextWindow: 1048576,
	maxTokens: 65535,
};

test("buildRequest sanitizes legacy tool schemas for Antigravity Claude", () => {
	const request = buildRequest(
		antigravityClaudeModel,
		{
			messages: [{ role: "user", content: "hi", timestamp: 0 }],
			tools: [
				{
					name: "schema_probe",
					description: "probe",
					parameters: {
						type: "object",
						properties: {
							mode: { anyOf: [{ const: "a" }, { const: "b" }] },
							labels: { type: "object", patternProperties: { ".*": { type: "string" } } },
						},
						required: ["mode"],
					},
				},
			],
		},
		"test-project",
		{},
		true,
	);

	const decl = request.request.tools?.[0]?.functionDeclarations?.[0] as Record<string, any>;
	assert.ok(decl.parameters);
	assert.equal(decl.parameters.properties.mode.type, "string");
	assert.deepEqual(decl.parameters.properties.mode.enum, ["a", "b"]);
	assert.equal(decl.parameters.properties.mode.anyOf, undefined);
	assert.equal(decl.parameters.properties.labels.patternProperties, undefined);
	assert.deepEqual(decl.parameters.properties.labels.additionalProperties, { type: "string" });
});

test("buildRequest keeps parametersJsonSchema for Gemini models", () => {
	const request = buildRequest(
		antigravityGeminiModel,
		{
			messages: [{ role: "user", content: "hi", timestamp: 0 }],
			tools: [
				{
					name: "schema_probe",
					description: "probe",
					parameters: {
						type: "object",
						properties: {
							mode: { anyOf: [{ const: "a" }, { const: "b" }] },
						},
					},
				},
			],
		},
		"test-project",
		{},
		true,
	);

	const decl = request.request.tools?.[0]?.functionDeclarations?.[0] as Record<string, any>;
	assert.ok(decl.parametersJsonSchema);
	assert.equal(decl.parameters, undefined);
});
