// GSD2 — Tests for Ollama model capability detection
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	getModelCapabilities,
	estimateContextFromParams,
	humanizeModelName,
	formatModelSize,
} from "../model-capabilities.js";

// ─── getModelCapabilities ────────────────────────────────────────────────────

describe("getModelCapabilities", () => {
	it("returns reasoning for deepseek-r1 models", () => {
		const caps = getModelCapabilities("deepseek-r1:8b");
		assert.equal(caps.reasoning, true);
		assert.equal(caps.contextWindow, 131072);
	});

	it("returns reasoning for qwq models", () => {
		const caps = getModelCapabilities("qwq:32b");
		assert.equal(caps.reasoning, true);
	});

	it("returns vision for llava models", () => {
		const caps = getModelCapabilities("llava:7b");
		assert.deepEqual(caps.input, ["text", "image"]);
	});

	it("returns vision for llama3.2-vision models", () => {
		const caps = getModelCapabilities("llama3.2-vision:11b");
		assert.deepEqual(caps.input, ["text", "image"]);
	});

	it("returns correct context for llama3.1", () => {
		const caps = getModelCapabilities("llama3.1:8b");
		assert.equal(caps.contextWindow, 131072);
	});

	it("returns correct context for llama3 (no .1)", () => {
		const caps = getModelCapabilities("llama3:8b");
		assert.equal(caps.contextWindow, 8192);
	});

	it("returns correct context for llama2", () => {
		const caps = getModelCapabilities("llama2:7b");
		assert.equal(caps.contextWindow, 4096);
	});

	it("returns correct context for qwen2.5-coder", () => {
		const caps = getModelCapabilities("qwen2.5-coder:7b");
		assert.equal(caps.contextWindow, 131072);
		assert.equal(caps.maxTokens, 32768);
	});

	it("returns correct context for codestral", () => {
		const caps = getModelCapabilities("codestral:22b");
		assert.equal(caps.contextWindow, 262144);
	});

	it("returns correct context for mistral-nemo", () => {
		const caps = getModelCapabilities("mistral-nemo:12b");
		assert.equal(caps.contextWindow, 131072);
	});

	it("returns correct context for gemma3", () => {
		const caps = getModelCapabilities("gemma3:9b");
		assert.equal(caps.contextWindow, 131072);
	});

	it("returns empty object for unknown models", () => {
		const caps = getModelCapabilities("totally-unknown-model:3b");
		assert.deepEqual(caps, {});
	});

	it("strips tag before matching", () => {
		const caps = getModelCapabilities("llama3.1:70b-instruct-q4_0");
		assert.equal(caps.contextWindow, 131072);
	});

	it("matches case-insensitively", () => {
		const caps = getModelCapabilities("Llama3.1:8B");
		assert.equal(caps.contextWindow, 131072);
	});

	// ─── New reasoning-model fallback entries (cloud + local) ──────────────────
	// These exist as a fallback for ollama versions whose /api/show response
	// does not include the `capabilities` array. When capabilities are present,
	// detection happens dynamically in ollama-discovery.ts.

	it("flags gpt-oss as reasoning (covers :20b, :120b, :*-cloud)", () => {
		assert.equal(getModelCapabilities("gpt-oss:20b").reasoning, true);
		assert.equal(getModelCapabilities("gpt-oss:120b-cloud").reasoning, true);
	});

	it("flags deepseek-v3.1/v4 family as reasoning", () => {
		assert.equal(getModelCapabilities("deepseek-v3.1:671b-cloud").reasoning, true);
		assert.equal(getModelCapabilities("deepseek-v4-flash:cloud").reasoning, true);
	});

	it("flags glm-4.x/5.x family as reasoning", () => {
		assert.equal(getModelCapabilities("glm-4.6:cloud").reasoning, true);
		assert.equal(getModelCapabilities("glm-5.1:cloud").reasoning, true);
	});

	it("flags kimi-k2 family as reasoning", () => {
		assert.equal(getModelCapabilities("kimi-k2:1t-cloud").reasoning, true);
		assert.equal(getModelCapabilities("kimi-k2.6:cloud").reasoning, true);
	});

	it("flags qwen3 as reasoning (hybrid thinking model)", () => {
		assert.equal(getModelCapabilities("qwen3:8b").reasoning, true);
		assert.equal(getModelCapabilities("qwen3-next:cloud").reasoning, true);
	});

	it("flags minimax-m2 family as reasoning", () => {
		assert.equal(getModelCapabilities("minimax-m2.7:cloud").reasoning, true);
	});

	it("flags gemma4 (with thinking) as reasoning", () => {
		assert.equal(getModelCapabilities("gemma4:31b-cloud").reasoning, true);
	});

	it("flags gemini-3-flash-preview as reasoning", () => {
		assert.equal(getModelCapabilities("gemini-3-flash-preview:cloud").reasoning, true);
	});
});

// ─── estimateContextFromParams ───────────────────────────────────────────────

describe("estimateContextFromParams", () => {
	it("estimates 8192 for small models", () => {
		assert.equal(estimateContextFromParams("1.5B"), 8192);
	});

	it("estimates 16384 for 7B models", () => {
		assert.equal(estimateContextFromParams("7B"), 16384);
	});

	it("estimates 32768 for 13B models", () => {
		assert.equal(estimateContextFromParams("13B"), 32768);
	});

	it("estimates 65536 for 34B models", () => {
		assert.equal(estimateContextFromParams("34B"), 65536);
	});

	it("estimates 131072 for 70B+ models", () => {
		assert.equal(estimateContextFromParams("70B"), 131072);
	});

	it("handles decimal sizes", () => {
		assert.equal(estimateContextFromParams("7.5B"), 16384);
	});

	it("handles M (millions)", () => {
		assert.equal(estimateContextFromParams("500M"), 8192);
	});

	it("returns 8192 for unparseable input", () => {
		assert.equal(estimateContextFromParams("unknown"), 8192);
	});

	it("returns 8192 for empty string", () => {
		assert.equal(estimateContextFromParams(""), 8192);
	});
});

// ─── humanizeModelName ───────────────────────────────────────────────────────

describe("humanizeModelName", () => {
	it("capitalizes and adds tag", () => {
		assert.equal(humanizeModelName("llama3.1:8b"), "Llama 3.1 8B");
	});

	it("handles latest tag", () => {
		assert.equal(humanizeModelName("llama3.1:latest"), "Llama 3.1");
	});

	it("handles no tag", () => {
		assert.equal(humanizeModelName("llama3.1"), "Llama 3.1");
	});

	it("handles hyphenated names", () => {
		const result = humanizeModelName("deepseek-r1:8b");
		assert.ok(result.includes("8B"));
	});
});

// ─── formatModelSize ─────────────────────────────────────────────────────────

describe("formatModelSize", () => {
	it("formats GB", () => {
		assert.equal(formatModelSize(4_700_000_000), "4.7 GB");
	});

	it("formats MB", () => {
		assert.equal(formatModelSize(500_000_000), "500.0 MB");
	});

	it("formats KB", () => {
		assert.equal(formatModelSize(500_000), "500 KB");
	});
});
