import assert from "node:assert/strict";
import test from "node:test";

import type { Api, Model } from "../../types.js";
import type { OAuthCredentials } from "./index.js";
import { githubCopilotOAuthProvider } from "./github-copilot.js";

function makeModel(provider: string, id: string): Model<Api> {
	return {
		id,
		name: id,
		api: "openai-completions",
		provider,
		baseUrl: `${provider}:`,
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16384,
	};
}

function makeCredentials(overrides: Partial<OAuthCredentials & { modelLimits?: Record<string, { contextWindow: number; maxTokens: number }> }> = {}) {
	return {
		type: "oauth" as const,
		access: "copilot-token",
		refresh: "refresh-token",
		expires: Date.now() + 60_000,
		...overrides,
	};
}

test("githubCopilotOAuthProvider.modifyModels filters unavailable copilot models (#3849)", () => {
	const models = [
		makeModel("github-copilot", "gpt-5"),
		makeModel("github-copilot", "claude-sonnet-4"),
		makeModel("openai", "gpt-4.1"),
	];

	assert.ok(githubCopilotOAuthProvider.modifyModels, "github copilot provider should expose modifyModels");
	const modified = githubCopilotOAuthProvider.modifyModels(models, makeCredentials({
		modelLimits: {
			"gpt-5": { contextWindow: 256000, maxTokens: 32000 },
		},
	}));

	assert.deepEqual(
		modified.map((model) => `${model.provider}/${model.id}`),
		["github-copilot/gpt-5", "openai/gpt-4.1"],
	);

	const copilotModel = modified.find((model) => model.provider === "github-copilot" && model.id === "gpt-5");
	assert.ok(copilotModel, "available copilot model should remain");
	assert.equal(copilotModel.contextWindow, 256000);
	assert.equal(copilotModel.maxTokens, 32000);
	assert.match(copilotModel.baseUrl, /githubcopilot\.com/);
});

test("githubCopilotOAuthProvider.modifyModels keeps all copilot models when limits are unavailable", () => {
	const models = [
		makeModel("github-copilot", "gpt-5"),
		makeModel("github-copilot", "claude-sonnet-4"),
	];

	assert.ok(githubCopilotOAuthProvider.modifyModels, "github copilot provider should expose modifyModels");
	const modified = githubCopilotOAuthProvider.modifyModels(models, makeCredentials());

	assert.equal(modified.length, 2, "lack of limits should not hide every copilot model");
	assert.ok(modified.every((model) => model.provider === "github-copilot"));
	assert.ok(modified.every((model) => model.baseUrl.includes("githubcopilot.com")));
});
