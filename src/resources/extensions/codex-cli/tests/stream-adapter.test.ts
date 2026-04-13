import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import type {
	AssistantMessageEvent,
	Context,
	Message,
	Model,
	ServerToolUseContent,
	TextContent,
	ThinkingContent,
	ToolCall,
	WebSearchResultContent,
} from "@gsd/pi-ai";
import {
	buildCodexClientOptions,
	buildPromptFromContext,
	buildThreadOptions,
	getCodexLookupCommand,
	makeStreamExhaustedErrorMessage,
	mapUsage,
	parseCodexLookupOutput,
	setCodexPathForTests,
	setCodexSdkLoaderForTests,
	streamViaCodexCli,
} from "../stream-adapter.ts";
import type {
	CodexClientLike,
	CodexThreadEvent,
	CodexThreadOptions,
	CodexTurnOptions,
} from "../sdk-types.ts";

afterEach(() => {
	setCodexSdkLoaderForTests(null);
	setCodexPathForTests(null);
});

function makeModel(id = "gpt-5.4"): Model<any> {
	return {
		id,
		name: id,
		api: "openai-codex-responses",
		provider: "codex-cli",
		baseUrl: "local://codex-cli",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 272000,
		maxTokens: 128000,
	};
}

async function collectEvents(stream: AsyncIterable<AssistantMessageEvent>): Promise<AssistantMessageEvent[]> {
	const events: AssistantMessageEvent[] = [];
	for await (const event of stream) {
		events.push(event);
	}
	return events;
}

function createSdk(eventsFactory: (input: string, options?: CodexTurnOptions) => AsyncGenerator<CodexThreadEvent>) {
	let capturedOptions: CodexThreadOptions | undefined;
	let capturedInput = "";

	class FakeCodex implements CodexClientLike {
		startThread(options?: CodexThreadOptions) {
			capturedOptions = options;
			return {
				runStreamed: async (input: string, turnOptions?: CodexTurnOptions) => {
					capturedInput = input;
					return { events: eventsFactory(input, turnOptions) };
				},
			};
		}
	}

	return {
		module: async () => ({ Codex: FakeCodex as any }),
		getCapturedOptions: () => capturedOptions,
		getCapturedInput: () => capturedInput,
	};
}

describe("codex-cli stream adapter", () => {
	test("buildPromptFromContext includes system, user, and assistant text", () => {
		const context: Context = {
			systemPrompt: "You are a helpful assistant.",
			messages: [
				{ role: "user", content: "What is 2+2?" } as Message,
				{
					role: "assistant",
					content: [{ type: "text", text: "4" }],
					api: "openai-codex-responses",
					provider: "codex-cli",
					model: "gpt-5.4",
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
					stopReason: "stop",
					timestamp: Date.now(),
				} as Message,
				{ role: "user", content: "Now multiply that by 3" } as Message,
			],
		};

		const prompt = buildPromptFromContext(context);
		assert.ok(prompt.includes("helpful assistant"));
		assert.ok(prompt.includes("2+2"));
		assert.ok(prompt.includes("4"));
		assert.ok(prompt.includes("multiply"));
	});

	test("buildThreadOptions sets Codex execution defaults", () => {
		const options = buildThreadOptions(makeModel(), { reasoning: "high" });
		assert.equal(options.model, "gpt-5.4");
		assert.equal(options.sandboxMode, "danger-full-access");
		assert.equal(options.approvalPolicy, "never");
		assert.equal(options.skipGitRepoCheck, true);
		assert.equal(options.workingDirectory, process.cwd());
		assert.equal(options.modelReasoningEffort, "high");
	});

	test("buildCodexClientOptions uses the resolved codex binary path", () => {
		setCodexPathForTests("/usr/local/bin/codex");
		assert.deepEqual(buildCodexClientOptions(), { codexPathOverride: "/usr/local/bin/codex" });
	});

	test("mapUsage converts Codex usage to zero-cost GSD usage", () => {
		assert.deepEqual(mapUsage({
			input_tokens: 10,
			cached_input_tokens: 2,
			output_tokens: 5,
		}), {
			input: 10,
			output: 5,
			cacheRead: 2,
			cacheWrite: 0,
			totalTokens: 17,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		});
	});

	test("maps reasoning, text, and usage events into a completed assistant turn", async () => {
		const sdk = createSdk(async function* () {
			yield { type: "thread.started", thread_id: "thread_1" };
			yield { type: "item.started", item: { id: "r1", type: "reasoning", text: "" } };
			yield { type: "item.updated", item: { id: "r1", type: "reasoning", text: "Plan" } };
			yield { type: "item.completed", item: { id: "r1", type: "reasoning", text: "Plan done" } };
			yield { type: "item.started", item: { id: "a1", type: "agent_message", text: "" } };
			yield { type: "item.updated", item: { id: "a1", type: "agent_message", text: "Hello" } };
			yield { type: "item.completed", item: { id: "a1", type: "agent_message", text: "Hello world" } };
			yield {
				type: "turn.completed",
				usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 5 },
			};
		});
		setCodexSdkLoaderForTests(sdk.module);
		setCodexPathForTests("/usr/local/bin/codex");

		const stream = streamViaCodexCli(makeModel(), { messages: [{ role: "user", content: "hi", timestamp: Date.now() }] });
		const events = await collectEvents(stream);
		const result = await stream.result();

		assert.equal(events[0]?.type, "start");
		assert.ok(events.some((event) => event.type === "thinking_start"));
		assert.ok(events.some((event) => event.type === "thinking_delta" && event.delta === "Plan"));
		assert.ok(events.some((event) => event.type === "text_start"));
		assert.ok(events.some((event) => event.type === "text_delta" && event.delta === "Hello"));
		assert.equal(events.at(-1)?.type, "done");
		assert.deepEqual(result.usage, {
			input: 10,
			output: 5,
			cacheRead: 2,
			cacheWrite: 0,
			totalTokens: 17,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		});
			assert.deepEqual(
				result.content.map(
					(
						block:
							| TextContent
							| ThinkingContent
							| ToolCall
							| ServerToolUseContent
							| WebSearchResultContent,
					) => {
						switch (block.type) {
							case "text":
								return block.text;
							case "thinking":
								return block.thinking;
							default:
								return block.type;
						}
					},
				),
				["Plan done", "Hello world"],
			);
		assert.equal(sdk.getCapturedOptions()?.model, "gpt-5.4");
		assert.ok(sdk.getCapturedInput().includes("hi"));
	});

	test("non-prefix rewrites are not emitted as deltas but final content is preserved", async () => {
		const sdk = createSdk(async function* () {
			yield { type: "thread.started", thread_id: "thread_1" };
			yield { type: "item.started", item: { id: "a1", type: "agent_message", text: "" } };
			yield { type: "item.updated", item: { id: "a1", type: "agent_message", text: "First draft" } };
			yield { type: "item.completed", item: { id: "a1", type: "agent_message", text: "Final answer" } };
			yield {
				type: "turn.completed",
				usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 2 },
			};
		});
		setCodexSdkLoaderForTests(sdk.module);
		setCodexPathForTests("/usr/local/bin/codex");

		const stream = streamViaCodexCli(makeModel(), { messages: [{ role: "user", content: "hi", timestamp: Date.now() }] });
		const events = await collectEvents(stream);
		const textDeltas = events.filter((event) => event.type === "text_delta");
		const textEnd = events.find((event) => event.type === "text_end");

		assert.equal(textDeltas.length, 1, "only the append-only update should produce a delta");
		assert.equal(textDeltas[0]?.delta, "First draft");
		assert.equal(textEnd?.type, "text_end");
		if (textEnd?.type === "text_end") {
			assert.equal(textEnd.content, "Final answer");
		}
	});

	test("surfaces a helpful error when the optional SDK is missing", async () => {
		setCodexSdkLoaderForTests(async () => {
			throw new Error("Cannot find package '@openai/codex-sdk'");
		});

		const stream = streamViaCodexCli(makeModel(), { messages: [{ role: "user", content: "hi", timestamp: Date.now() }] });
		const events = await collectEvents(stream);
		const result = await stream.result();

		assert.equal(events.at(-1)?.type, "error");
		assert.equal(result.stopReason, "error");
		assert.match(result.errorMessage ?? "", /@openai\/codex-sdk/);
	});

	test("turn failure becomes an assistant error message", async () => {
		const sdk = createSdk(async function* () {
			yield { type: "thread.started", thread_id: "thread_1" };
			yield { type: "turn.failed", error: { message: "codex turn failed" } };
		});
		setCodexSdkLoaderForTests(sdk.module);
		setCodexPathForTests("/usr/local/bin/codex");

		const stream = streamViaCodexCli(makeModel(), { messages: [{ role: "user", content: "hi", timestamp: Date.now() }] });
		const events = await collectEvents(stream);
		const result = await stream.result();

		assert.equal(events.at(-1)?.type, "error");
		assert.equal(result.stopReason, "error");
		assert.equal(result.errorMessage, "codex turn failed");
	});

	test("aborted signals become aborted assistant messages", async () => {
		const controller = new AbortController();
		controller.abort();

		const stream = streamViaCodexCli(makeModel(), {
			messages: [{ role: "user", content: "hi", timestamp: Date.now() }],
		}, {
			signal: controller.signal,
		});
		const events = await collectEvents(stream);
		const result = await stream.result();

		assert.equal(events.at(-1)?.type, "error");
		assert.equal(result.stopReason, "aborted");
	});

	test("generator exhaustion becomes a classifiable error", () => {
		const message = makeStreamExhaustedErrorMessage({
			role: "assistant",
			content: [{ type: "text", text: "partial answer" }],
			api: "openai-codex-responses",
			provider: "codex-cli",
			model: "gpt-5.4",
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
			stopReason: "stop",
			timestamp: Date.now(),
		});
		assert.equal(message.stopReason, "error");
		assert.equal(message.errorMessage, "stream_exhausted_without_result");
	});
});

describe("codex-cli path lookup helpers", () => {
	test("getCodexLookupCommand uses where on Windows", () => {
		assert.equal(getCodexLookupCommand("win32"), "where codex");
	});

	test("getCodexLookupCommand uses which on non-Windows platforms", () => {
		assert.equal(getCodexLookupCommand("darwin"), "which codex");
		assert.equal(getCodexLookupCommand("linux"), "which codex");
	});

	test("parseCodexLookupOutput keeps the first lookup result", () => {
		const output = "/opt/homebrew/bin/codex\n/usr/local/bin/codex\n";
		assert.equal(parseCodexLookupOutput(output), "/opt/homebrew/bin/codex");
	});
});
