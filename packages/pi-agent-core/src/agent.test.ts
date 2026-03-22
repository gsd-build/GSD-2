// Agent activeInferenceModel tests
// Verifies that activeInferenceModel tracks the model used for the current
// inference, not the configured model which can change mid-turn.
// Regression test for https://github.com/gsd-build/gsd-2/issues/1844 Bug 2

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Agent } from "./agent.js";
import { getModel } from "@gsd/pi-ai";

// Minimal streamFn stub that yields a single assistant message then ends.
// Allows us to observe agent state during the streaming lifecycle.
function createMockStreamFn() {
	return async function* mockStream() {
		yield {
			role: "assistant" as const,
			content: [{ type: "text" as const, text: "hello" }],
			api: "openai-completions",
			provider: "google",
			model: "gemini-2.5-flash-lite-preview-06-17",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "end_turn",
			timestamp: Date.now(),
		};
	};
}

// streamFn that pauses mid-stream, giving us a window to switch models
function createPausableStreamFn(onStreaming: () => void) {
	return async function* pausableStream() {
		// Signal that streaming has started — caller can now switch models
		onStreaming();

		yield {
			role: "assistant" as const,
			content: [{ type: "text" as const, text: "response" }],
			api: "openai-completions",
			provider: "google",
			model: "gemini-2.5-flash-lite-preview-06-17",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "end_turn",
			timestamp: Date.now(),
		};
	};
}

const sonnetModel = getModel("anthropic", "claude-sonnet-4-20250514");
const opusModel = getModel("anthropic", "claude-opus-4-20250514");

describe("Agent — activeInferenceModel", () => {
	it("is undefined when agent is idle", () => {
		const agent = new Agent({
			initialState: { model: sonnetModel },
		});
		assert.equal(agent.state.activeInferenceModel, undefined);
	});

	it("is set to the model at _runLoop start and cleared after completion", async () => {
		const agent = new Agent({
			initialState: { model: sonnetModel },
			streamFn: createMockStreamFn(),
		});

		let modelDuringStream: typeof sonnetModel | undefined;
		agent.subscribe((e) => {
			if (e.type === "message_start") {
				modelDuringStream = agent.state.activeInferenceModel;
			}
		});

		await agent.prompt("test");

		// During streaming, activeInferenceModel should have been set
		assert.deepStrictEqual(modelDuringStream?.id, sonnetModel.id);
		assert.deepStrictEqual(modelDuringStream?.provider, sonnetModel.provider);

		// After completion, activeInferenceModel should be cleared
		assert.equal(agent.state.activeInferenceModel, undefined);
	});

	it("reflects the original model even after setModel is called mid-turn", async () => {
		let streamingStarted = false;
		const agent = new Agent({
			initialState: { model: sonnetModel },
			streamFn: createPausableStreamFn(() => {
				streamingStarted = true;
			}),
		});

		let inferenceModelDuringStream: typeof sonnetModel | undefined;
		let configuredModelDuringStream: typeof sonnetModel | undefined;

		agent.subscribe((e) => {
			if (e.type === "message_start" && streamingStarted) {
				// Switch configured model mid-stream
				agent.setModel(opusModel);
				// Capture both values
				inferenceModelDuringStream = agent.state.activeInferenceModel;
				configuredModelDuringStream = agent.state.model;
			}
		});

		await agent.prompt("test");

		// The configured model should have changed to opus
		assert.equal(configuredModelDuringStream?.id, opusModel.id);
		assert.equal(configuredModelDuringStream?.provider, opusModel.provider);

		// But activeInferenceModel should still be sonnet (the model actually doing inference)
		assert.equal(inferenceModelDuringStream?.id, sonnetModel.id);
		assert.equal(inferenceModelDuringStream?.provider, sonnetModel.provider);

		// After completion, activeInferenceModel should be cleared
		assert.equal(agent.state.activeInferenceModel, undefined);

		// state.model should remain as what was last set
		assert.equal(agent.state.model.id, opusModel.id);
	});
});
