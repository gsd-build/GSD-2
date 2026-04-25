// GSD2 — Tests for ollama think-parameter mapping
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Api, Model, SimpleStreamOptions } from "@gsd/pi-ai";
import { buildThinkParam } from "../ollama-chat-provider.js";

function modelStub(reasoning: boolean, id = "gpt-oss:20b"): Model<Api> {
	return {
		id,
		name: id,
		api: "openai-completions" as Api,
		provider: "ollama",
		baseUrl: "http://localhost:11434",
		reasoning,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 131072,
		maxTokens: 32768,
	};
}

describe("buildThinkParam — gating", () => {
	it("returns undefined when model.reasoning is false", () => {
		const m = modelStub(false);
		const opts: SimpleStreamOptions = { reasoning: "high" };
		assert.equal(buildThinkParam(m, opts), undefined);
	});

	it("returns undefined when options.reasoning is undefined (preserve existing default)", () => {
		const m = modelStub(true);
		assert.equal(buildThinkParam(m, {}), undefined);
		assert.equal(buildThinkParam(m, undefined), undefined);
	});
});

describe("buildThinkParam — ThinkingLevel mapping", () => {
	const m = modelStub(true);

	it("maps 'minimal' to false (turn thinking off)", () => {
		assert.equal(buildThinkParam(m, { reasoning: "minimal" }), false);
	});

	it("passes 'low' through as string", () => {
		assert.equal(buildThinkParam(m, { reasoning: "low" }), "low");
	});

	it("passes 'medium' through as string", () => {
		assert.equal(buildThinkParam(m, { reasoning: "medium" }), "medium");
	});

	it("passes 'high' through as string", () => {
		assert.equal(buildThinkParam(m, { reasoning: "high" }), "high");
	});

	it("collapses 'xhigh' to 'high' (ollama caps at high)", () => {
		assert.equal(buildThinkParam(m, { reasoning: "xhigh" }), "high");
	});
});
