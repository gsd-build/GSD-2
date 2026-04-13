/**
 * Stream adapter: bridges the Codex SDK into GSD's streamSimple contract.
 *
 * The SDK runs a full Codex turn and exposes structured thread events.
 * This adapter maps the stable subset we care about today — reasoning,
 * assistant text, usage, and terminal errors — into AssistantMessageEvents.
 */

import type {
	Api,
	AssistantMessage,
	AssistantMessageEvent,
	AssistantMessageEventStream,
	Context,
	Model,
	SimpleStreamOptions,
	TextContent,
	ThinkingContent,
	Usage,
} from "@gsd/pi-ai";
import { EventStream } from "@gsd/pi-ai";
import { execSync } from "node:child_process";
import type {
	CodexClientLike,
	CodexSdkModule,
	CodexThreadEvent,
	CodexThreadItem,
	CodexThreadOptions,
	CodexUsage,
} from "./sdk-types.js";

const ZERO_USAGE: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

type RenderableKind = "text" | "thinking";
type RenderableEvent = Extract<CodexThreadEvent, { type: "item.started" | "item.updated" | "item.completed" }>;

interface RenderableState {
	contentIndex: number;
	kind: RenderableKind;
	text: string;
	ended: boolean;
}

let cachedCodexPath: string | null = null;
let codexPathOverrideForTests: string | null = null;
let sdkLoaderForTests: (() => Promise<CodexSdkModule>) | null = null;

function createStream(): AssistantMessageEventStream {
	return new EventStream<AssistantMessageEvent, AssistantMessage>(
		(event) => event.type === "done" || event.type === "error",
		(event) => {
			if (event.type === "done") return event.message;
			if (event.type === "error") return event.error;
			throw new Error("Unexpected event type for final result");
		},
	) as AssistantMessageEventStream;
}

export function getCodexLookupCommand(platform: NodeJS.Platform = process.platform): string {
	return platform === "win32" ? "where codex" : "which codex";
}

export function parseCodexLookupOutput(output: Buffer | string): string {
	return output
		.toString()
		.trim()
		.split(/\r?\n/)[0] ?? "";
}

function getCodexPath(): string {
	if (codexPathOverrideForTests) return codexPathOverrideForTests;
	if (cachedCodexPath) return cachedCodexPath;
	try {
		cachedCodexPath = parseCodexLookupOutput(
			execSync(getCodexLookupCommand(), { timeout: 5_000, stdio: "pipe" }),
		);
	} catch {
		cachedCodexPath = "codex";
	}
	return cachedCodexPath;
}

async function loadCodexSdk(): Promise<CodexSdkModule> {
	if (sdkLoaderForTests) {
		return sdkLoaderForTests();
	}
	const sdkModule = "@openai/codex-sdk";
	return import(/* webpackIgnore: true */ sdkModule) as Promise<CodexSdkModule>;
}

function extractMessageText(msg: { role: string; content: unknown }): string {
	if (typeof msg.content === "string") return msg.content;
	if (Array.isArray(msg.content)) {
		const textParts = msg.content
			.filter((part: any) => part.type === "text")
			.map((part: any) => part.text ?? "");
		if (textParts.length > 0) return textParts.join("\n");
	}
	return "";
}

export function buildPromptFromContext(context: Context): string {
	const parts: string[] = [];

	if (context.systemPrompt) {
		parts.push(`[System]\n${context.systemPrompt}`);
	}

	for (const msg of context.messages) {
		const text = extractMessageText(msg);
		if (!text) continue;

		const label = msg.role === "user" ? "User" : msg.role === "assistant" ? "Assistant" : "System";
		parts.push(`[${label}]\n${text}`);
	}

	return parts.join("\n\n");
}

export function buildCodexClientOptions() {
	return {
		codexPathOverride: getCodexPath(),
	};
}

export function buildThreadOptions(
	model: Model<any>,
	options?: SimpleStreamOptions,
): CodexThreadOptions {
	return {
		model: model.id,
		sandboxMode: "danger-full-access",
		workingDirectory: process.cwd(),
		skipGitRepoCheck: true,
		approvalPolicy: "never",
		...(options?.reasoning ? { modelReasoningEffort: options.reasoning } : {}),
	};
}

export function mapUsage(usage: CodexUsage): Usage {
	return {
		input: usage.input_tokens,
		output: usage.output_tokens,
		cacheRead: usage.cached_input_tokens,
		cacheWrite: 0,
		totalTokens: usage.input_tokens + usage.cached_input_tokens + usage.output_tokens,
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			total: 0,
		},
	};
}

function createInitialMessage(modelId: string): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: "openai-codex-responses" as Api,
		provider: "codex-cli",
		model: modelId,
		usage: { ...ZERO_USAGE },
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

function buildFailureMessage(
	output: AssistantMessage,
	errorMsg: string,
	reason: "error" | "aborted" = "error",
): AssistantMessage {
	if (output.content.length > 0) {
		return {
			...output,
			content: output.content.map((block) => ({ ...block })) as AssistantMessage["content"],
			stopReason: reason,
			errorMessage: errorMsg,
			timestamp: Date.now(),
		};
	}

	return {
		...createInitialMessage(output.model),
		content: [{ type: "text", text: `Codex CLI error: ${errorMsg}` }],
		stopReason: reason,
		errorMessage: errorMsg,
		timestamp: Date.now(),
	};
}

export function makeStreamExhaustedErrorMessage(output: AssistantMessage): AssistantMessage {
	return buildFailureMessage(output, "stream_exhausted_without_result");
}

function getRenderableItem(item: CodexThreadItem): { id: string; kind: RenderableKind; text: string } | null {
	if (item.type === "agent_message") {
		return { id: item.id, kind: "text", text: item.text };
	}
	if (item.type === "reasoning") {
		return { id: item.id, kind: "thinking", text: item.text };
	}
	return null;
}

function createContentBlock(kind: RenderableKind): TextContent | ThinkingContent {
	return kind === "text" ? { type: "text", text: "" } : { type: "thinking", thinking: "" };
}

function setBlockText(output: AssistantMessage, state: RenderableState, text: string): void {
	const block = output.content[state.contentIndex];
	if (block.type === "text") {
		block.text = text;
	} else if (block.type === "thinking") {
		block.thinking = text;
	}
	state.text = text;
}

function ensureRenderableState(
	output: AssistantMessage,
	stream: AssistantMessageEventStream,
	states: Map<string, RenderableState>,
	item: { id: string; kind: RenderableKind },
): RenderableState {
	const existing = states.get(item.id);
	if (existing) return existing;

	const contentIndex = output.content.length;
	output.content.push(createContentBlock(item.kind));
	const state: RenderableState = {
		contentIndex,
		kind: item.kind,
		text: "",
		ended: false,
	};
	states.set(item.id, state);

	stream.push(
		item.kind === "text"
			? { type: "text_start", contentIndex, partial: output }
			: { type: "thinking_start", contentIndex, partial: output },
	);
	return state;
}

function emitAppendDelta(
	output: AssistantMessage,
	stream: AssistantMessageEventStream,
	state: RenderableState,
	nextText: string,
): void {
	if (nextText === state.text) return;

	if (nextText.startsWith(state.text)) {
		const delta = nextText.slice(state.text.length);
		setBlockText(output, state, nextText);
		stream.push(
			state.kind === "text"
				? { type: "text_delta", contentIndex: state.contentIndex, delta, partial: output }
				: { type: "thinking_delta", contentIndex: state.contentIndex, delta, partial: output },
		);
		return;
	}

	setBlockText(output, state, nextText);
}

function closeRenderableState(
	output: AssistantMessage,
	stream: AssistantMessageEventStream,
	state: RenderableState,
): void {
	if (state.ended) return;
	state.ended = true;
	stream.push(
		state.kind === "text"
			? {
					type: "text_end",
					contentIndex: state.contentIndex,
					content: state.text,
					partial: output,
				}
			: {
					type: "thinking_end",
					contentIndex: state.contentIndex,
					content: state.text,
					partial: output,
				},
	);
}

function handleRenderableEvent(
	output: AssistantMessage,
	stream: AssistantMessageEventStream,
	states: Map<string, RenderableState>,
	event: RenderableEvent,
): void {
	const renderable = getRenderableItem(event.item);
	if (!renderable) return;

	const state = ensureRenderableState(output, stream, states, renderable);
	emitAppendDelta(output, stream, state, renderable.text);

	if (event.type === "item.completed") {
		closeRenderableState(output, stream, state);
	}
}

function closeOpenStates(
	output: AssistantMessage,
	stream: AssistantMessageEventStream,
	states: Map<string, RenderableState>,
): void {
	for (const state of states.values()) {
		closeRenderableState(output, stream, state);
	}
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
	if (signal?.aborted) return true;
	const message = error instanceof Error ? error.message : String(error);
	return /aborted|aborterror|request was aborted/i.test(message);
}

function normalizeSdkLoadError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	if (/Cannot find package ['"]@openai\/codex-sdk['"]|ERR_MODULE_NOT_FOUND/.test(message)) {
		return "Codex CLI provider requires the optional dependency @openai/codex-sdk. Reinstall GSD with optional dependencies enabled.";
	}
	return message;
}

export function streamViaCodexCli(
	model: Model<any>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const stream = createStream();
	void pumpCodexMessages(model, context, options, stream);
	return stream;
}

async function pumpCodexMessages(
	model: Model<any>,
	context: Context,
	options: SimpleStreamOptions | undefined,
	stream: AssistantMessageEventStream,
): Promise<void> {
	const output = createInitialMessage(model.id);
	const renderableStates = new Map<string, RenderableState>();
	let sawTerminalEvent = false;
	let turnFailureMessage: string | null = null;

	stream.push({ type: "start", partial: output });

	try {
		if (options?.signal?.aborted) {
			const aborted = buildFailureMessage(output, "Request was aborted", "aborted");
			stream.push({ type: "error", reason: "aborted", error: aborted });
			stream.end(aborted);
			return;
		}

		const sdk = await loadCodexSdk();
		const client: CodexClientLike = new sdk.Codex(buildCodexClientOptions());
		const thread = client.startThread(buildThreadOptions(model, options));
		const prompt = buildPromptFromContext(context);
		const { events } = await thread.runStreamed(prompt, { signal: options?.signal });

		for await (const event of events) {
			switch (event.type) {
				case "item.started":
				case "item.updated":
				case "item.completed":
					handleRenderableEvent(output, stream, renderableStates, event);
					break;
				case "turn.completed":
					output.usage = mapUsage(event.usage);
					sawTerminalEvent = true;
					break;
				case "turn.failed":
					turnFailureMessage = event.error.message;
					sawTerminalEvent = true;
					break;
				case "error":
					turnFailureMessage = event.message;
					sawTerminalEvent = true;
					break;
				default:
					break;
			}
		}

		closeOpenStates(output, stream, renderableStates);

		if (turnFailureMessage) {
			const errorReason = isAbortError(turnFailureMessage, options?.signal) ? "aborted" : "error";
			const failed = buildFailureMessage(output, turnFailureMessage, errorReason);
			stream.push({ type: "error", reason: errorReason, error: failed });
			stream.end(failed);
			return;
		}

		if (!sawTerminalEvent) {
			const exhausted = makeStreamExhaustedErrorMessage(output);
			stream.push({ type: "error", reason: "error", error: exhausted });
			stream.end(exhausted);
			return;
		}

		stream.push({ type: "done", reason: "stop", message: output });
		stream.end(output);
	} catch (error) {
		closeOpenStates(output, stream, renderableStates);
		const errorReason = isAbortError(error, options?.signal) ? "aborted" : "error";
		const failure = buildFailureMessage(output, normalizeSdkLoadError(error), errorReason);
		stream.push({ type: "error", reason: errorReason, error: failure });
		stream.end(failure);
	}
}

export function setCodexSdkLoaderForTests(loader?: (() => Promise<CodexSdkModule>) | null): void {
	sdkLoaderForTests = loader ?? null;
}

export function setCodexPathForTests(path?: string | null): void {
	codexPathOverrideForTests = path ?? null;
	cachedCodexPath = null;
}
