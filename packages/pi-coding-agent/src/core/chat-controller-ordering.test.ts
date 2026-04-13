import assert from "node:assert/strict";
import { test } from "node:test";

import { handleAgentEvent } from "../modes/interactive/controllers/chat-controller.js";

function makeUsage() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function makeAssistant(content: any[]) {
	return {
		role: "assistant",
		content,
		api: "anthropic-messages",
		provider: "claude-code",
		model: "claude-sonnet-4",
		usage: makeUsage(),
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

function createHost() {
	const chatContainer = {
		children: [] as any[],
		addChild(component: any) {
			this.children.push(component);
		},
		removeChild(component: any) {
			const idx = this.children.indexOf(component);
			if (idx !== -1) this.children.splice(idx, 1);
		},
		clear() {
			this.children = [];
		},
	};

	const pinnedMessageContainer = {
		children: [] as any[],
		addChild(component: any) {
			this.children.push(component);
		},
		removeChild(component: any) {
			const idx = this.children.indexOf(component);
			if (idx !== -1) this.children.splice(idx, 1);
		},
		clear() {
			this.children = [];
		},
	};

	const host: any = {
		isInitialized: true,
		init: async () => {},
		defaultEditor: { onEscape: undefined },
		editor: {},
		session: { retryAttempt: 0, abortCompaction: () => {}, abortRetry: () => {} },
		ui: { requestRender: () => {}, terminal: { rows: 50 } },
		footer: { invalidate: () => {} },
		keybindings: {},
		statusContainer: { clear: () => {}, addChild: () => {} },
		chatContainer,
		settingsManager: { getTimestampFormat: () => "date-time-iso", getShowImages: () => false },
		pendingTools: new Map(),
		toolOutputExpanded: false,
		hideThinkingBlock: false,
		isBashMode: false,
		defaultWorkingMessage: "Working...",
		compactionQueuedMessages: [],
		editorContainer: {},
		pendingMessagesContainer: { clear: () => {} },
		pinnedMessageContainer,
		addMessageToChat: () => {},
		getMarkdownThemeWithSettings: () => ({}),
		formatWebSearchResult: () => "",
		getRegisteredToolDefinition: () => undefined,
		checkShutdownRequested: async () => {},
		rebuildChatFromMessages: () => {},
		flushCompactionQueue: async () => {},
		showStatus: () => {},
		showError: () => {},
		updatePendingMessagesDisplay: () => {},
		updateTerminalTitle: () => {},
		updateEditorBorderColor: () => {},
	};

	return host;
}

test("chat-controller keeps tool output ahead of delayed assistant text for external tool streams", async () => {
	// ToolExecutionComponent uses the global theme singleton.
	// Install a minimal no-op theme implementation for this unit test.
	(globalThis as any)[Symbol.for("@gsd/pi-coding-agent:theme")] = {
		fg: (_key: string, text: string) => text,
		bg: (_key: string, text: string) => text,
		bold: (text: string) => text,
		italic: (text: string) => text,
		truncate: (text: string) => text,
	};

	const host = createHost();
	const toolId = "mcp-tool-1";
	const toolCall = {
		type: "toolCall",
		id: toolId,
		name: "exec_command",
		arguments: { cmd: "echo hi" },
	};

	await handleAgentEvent(host, { type: "message_start", message: makeAssistant([]) } as any);

	assert.equal(host.streamingComponent, undefined, "assistant component should be deferred at message_start");
	assert.equal(host.chatContainer.children.length, 0, "nothing should render before content arrives");

	await handleAgentEvent(
		host,
		{
			type: "message_update",
			message: makeAssistant([toolCall]),
			assistantMessageEvent: {
				type: "toolcall_end",
				contentIndex: 0,
				toolCall: {
					...toolCall,
					externalResult: {
						content: [{ type: "text", text: "tool output" }],
						details: {},
						isError: false,
					},
				},
				partial: makeAssistant([toolCall]),
			},
		} as any,
	);

	assert.equal(host.streamingComponent, undefined, "assistant text container should remain deferred for tool-only updates");
	assert.equal(host.chatContainer.children.length, 1, "tool execution block should render immediately");
	assert.equal(host.chatContainer.children[0]?.constructor?.name, "ToolExecutionComponent");

	// Re-assert required host method before the text-bearing update path.
	host.getMarkdownThemeWithSettings = () => ({});

	await handleAgentEvent(
		host,
		{
			type: "message_update",
			message: makeAssistant([toolCall, { type: "text", text: "done" }]),
			assistantMessageEvent: {
				type: "text_delta",
				contentIndex: 1,
				delta: "done",
				partial: makeAssistant([toolCall, { type: "text", text: "done" }]),
			},
		} as any,
	);

	assert.equal(host.chatContainer.children.length, 2, "assistant content should render after existing tool output");
	assert.equal(host.chatContainer.children[0]?.constructor?.name, "ToolExecutionComponent");
	assert.equal(host.chatContainer.children[1]?.constructor?.name, "AssistantMessageComponent");
});

test("chat-controller keeps serverToolUse output ahead of assistant text when external results arrive", async () => {
	(globalThis as any)[Symbol.for("@gsd/pi-coding-agent:theme")] = {
		fg: (_key: string, text: string) => text,
		bg: (_key: string, text: string) => text,
		bold: (text: string) => text,
		italic: (text: string) => text,
		truncate: (text: string) => text,
	};

	const host = createHost();
	const toolId = "mcp-secure-1";
	const serverToolUse = {
		type: "serverToolUse",
		id: toolId,
		name: "mcp__gsd-workflow__secure_env_collect",
		input: { projectDir: "/tmp/project", keys: [{ key: "SECURE_PASSWORD" }], destination: "dotenv" },
	};

	await handleAgentEvent(host, { type: "message_start", message: makeAssistant([]) } as any);

	await handleAgentEvent(
		host,
		{
			type: "message_update",
			message: makeAssistant([serverToolUse]),
			assistantMessageEvent: {
				type: "server_tool_use",
				contentIndex: 0,
				partial: makeAssistant([serverToolUse]),
			},
		} as any,
	);

	assert.equal(host.streamingComponent, undefined, "assistant content should stay deferred while only tool content streams");
	assert.equal(host.chatContainer.children.length, 1, "server tool block should render immediately");
	assert.equal(host.chatContainer.children[0]?.constructor?.name, "ToolExecutionComponent");

	host.getMarkdownThemeWithSettings = () => ({});
	const resultMessage = makeAssistant([
		{
			...serverToolUse,
			externalResult: {
				content: [{ type: "text", text: "secure_env_collect was cancelled by user." }],
				details: {},
				isError: true,
			},
		},
		{ type: "text", text: "The secure password collection was cancelled." },
	]);

	await handleAgentEvent(
		host,
		{
			type: "message_update",
			message: resultMessage,
			assistantMessageEvent: {
				type: "server_tool_use",
				contentIndex: 0,
				partial: resultMessage,
			},
		} as any,
	);

	assert.equal(host.chatContainer.children.length, 2, "assistant text should render after existing server tool output");
	assert.equal(host.chatContainer.children[0]?.constructor?.name, "ToolExecutionComponent");
	assert.equal(host.chatContainer.children[1]?.constructor?.name, "AssistantMessageComponent");
});

test("chat-controller pins latest assistant text above editor when tool calls are present", async () => {
	(globalThis as any)[Symbol.for("@gsd/pi-coding-agent:theme")] = {
		fg: (_key: string, text: string) => text,
		bg: (_key: string, text: string) => text,
		bold: (text: string) => text,
		italic: (text: string) => text,
		truncate: (text: string) => text,
	};

	const host = createHost();
	const toolId = "tool-pin-1";
	const toolCall = {
		type: "toolCall",
		id: toolId,
		name: "exec_command",
		arguments: { cmd: "echo hi" },
	};

	await handleAgentEvent(host, { type: "message_start", message: makeAssistant([]) } as any);

	assert.equal(host.pinnedMessageContainer.children.length, 0, "pinned zone should be empty at message_start");

	// Send a message with text followed by a tool call
	host.getMarkdownThemeWithSettings = () => ({});
	await handleAgentEvent(
		host,
		{
			type: "message_update",
			message: makeAssistant([
				{ type: "text", text: "Looking at the files now." },
				toolCall,
			]),
			assistantMessageEvent: {
				type: "toolcall_end",
				contentIndex: 1,
				toolCall: {
					...toolCall,
					externalResult: {
						content: [{ type: "text", text: "file contents" }],
						details: {},
						isError: false,
					},
				},
				partial: makeAssistant([{ type: "text", text: "Looking at the files now." }, toolCall]),
			},
		} as any,
	);

	// Pinned zone should now have a DynamicBorder and a Markdown component
	assert.equal(host.pinnedMessageContainer.children.length, 2, "pinned zone should have border + markdown");
	assert.equal(host.pinnedMessageContainer.children[0]?.constructor?.name, "DynamicBorder");
	assert.equal(host.pinnedMessageContainer.children[1]?.constructor?.name, "Markdown");
});

test("chat-controller clears pinned zone when a new assistant message starts", async () => {
	(globalThis as any)[Symbol.for("@gsd/pi-coding-agent:theme")] = {
		fg: (_key: string, text: string) => text,
		bg: (_key: string, text: string) => text,
		bold: (text: string) => text,
		italic: (text: string) => text,
		truncate: (text: string) => text,
	};

	const host = createHost();
	const toolCall = {
		type: "toolCall",
		id: "tool-clear-1",
		name: "exec_command",
		arguments: { cmd: "echo hi" },
	};

	await handleAgentEvent(host, { type: "message_start", message: makeAssistant([]) } as any);

	// Populate the pinned zone
	host.getMarkdownThemeWithSettings = () => ({});
	await handleAgentEvent(
		host,
		{
			type: "message_update",
			message: makeAssistant([{ type: "text", text: "Working on it." }, toolCall]),
			assistantMessageEvent: {
				type: "toolcall_end",
				contentIndex: 1,
				toolCall: {
					...toolCall,
					externalResult: {
						content: [{ type: "text", text: "ok" }],
						details: {},
						isError: false,
					},
				},
				partial: makeAssistant([{ type: "text", text: "Working on it." }, toolCall]),
			},
		} as any,
	);

	assert.ok(host.pinnedMessageContainer.children.length > 0, "pinned zone should be populated");

	// Start a new assistant message — pinned zone should clear
	await handleAgentEvent(host, { type: "message_start", message: makeAssistant([]) } as any);

	assert.equal(host.pinnedMessageContainer.children.length, 0, "pinned zone should clear on new assistant message");
});

test("chat-controller clears pinned zone when the agent turn ends", async () => {
	(globalThis as any)[Symbol.for("@gsd/pi-coding-agent:theme")] = {
		fg: (_key: string, text: string) => text,
		bg: (_key: string, text: string) => text,
		bold: (text: string) => text,
		italic: (text: string) => text,
		truncate: (text: string) => text,
	};

	const host = createHost();
	const toolCall = {
		type: "toolCall",
		id: "tool-clear-on-end-1",
		name: "exec_command",
		arguments: { cmd: "echo hi" },
	};

	await handleAgentEvent(host, { type: "message_start", message: makeAssistant([]) } as any);

	host.getMarkdownThemeWithSettings = () => ({});
	await handleAgentEvent(
		host,
		{
			type: "message_update",
			message: makeAssistant([{ type: "text", text: "Working on it." }, toolCall]),
			assistantMessageEvent: {
				type: "toolcall_end",
				contentIndex: 1,
				toolCall: {
					...toolCall,
					externalResult: {
						content: [{ type: "text", text: "ok" }],
						details: {},
						isError: false,
					},
				},
				partial: makeAssistant([{ type: "text", text: "Working on it." }, toolCall]),
			},
		} as any,
	);

	assert.ok(host.pinnedMessageContainer.children.length > 0, "pinned zone should be populated before agent_end");

	await handleAgentEvent(host, { type: "agent_end" } as any);

	assert.equal(host.pinnedMessageContainer.children.length, 0, "pinned zone should clear on agent_end");
});

test("chat-controller clears pinned zone when assistant message ends", async () => {
	(globalThis as any)[Symbol.for("@gsd/pi-coding-agent:theme")] = {
		fg: (_key: string, text: string) => text,
		bg: (_key: string, text: string) => text,
		bold: (text: string) => text,
		italic: (text: string) => text,
		truncate: (text: string) => text,
	};

	const host = createHost();
	const toolCall = {
		type: "toolCall",
		id: "tool-msg-end-1",
		name: "exec_command",
		arguments: { cmd: "echo hi" },
	};

	await handleAgentEvent(host, { type: "message_start", message: makeAssistant([]) } as any);

	host.getMarkdownThemeWithSettings = () => ({});
	const msgContent = [{ type: "text", text: "Summary after tools." }, toolCall];
	await handleAgentEvent(
		host,
		{
			type: "message_update",
			message: makeAssistant(msgContent),
			assistantMessageEvent: {
				type: "toolcall_end",
				contentIndex: 1,
				toolCall: {
					...toolCall,
					externalResult: {
						content: [{ type: "text", text: "ok" }],
						details: {},
						isError: false,
					},
				},
				partial: makeAssistant(msgContent),
			},
		} as any,
	);

	assert.ok(host.pinnedMessageContainer.children.length > 0, "pinned zone should be populated during streaming");

	// End the assistant message (e.g. before form elicitation) — pinned zone should clear
	await handleAgentEvent(host, { type: "message_end", message: makeAssistant(msgContent) } as any);

	assert.equal(host.pinnedMessageContainer.children.length, 0, "pinned zone should clear on message_end to prevent duplicate display");
});

test("chat-controller does not pin when there are no tool calls", async () => {
	(globalThis as any)[Symbol.for("@gsd/pi-coding-agent:theme")] = {
		fg: (_key: string, text: string) => text,
		bg: (_key: string, text: string) => text,
		bold: (text: string) => text,
		italic: (text: string) => text,
		truncate: (text: string) => text,
	};

	const host = createHost();

	await handleAgentEvent(host, { type: "message_start", message: makeAssistant([]) } as any);

	host.getMarkdownThemeWithSettings = () => ({});
	await handleAgentEvent(
		host,
		{
			type: "message_update",
			message: makeAssistant([{ type: "text", text: "Just some text, no tools." }]),
			assistantMessageEvent: {
				type: "text_delta",
				contentIndex: 0,
				delta: "Just some text, no tools.",
				partial: makeAssistant([{ type: "text", text: "Just some text, no tools." }]),
			},
		} as any,
	);

	assert.equal(host.pinnedMessageContainer.children.length, 0, "pinned zone should stay empty without tool calls");
});
