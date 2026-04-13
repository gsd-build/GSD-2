/**
 * Lightweight type mirrors for @openai/codex-sdk.
 *
 * These stubs allow the extension to compile without a hard dependency on
 * `@openai/codex-sdk`. The real SDK is imported dynamically at runtime in
 * stream-adapter.ts.
 */

export type CodexApprovalMode = "never" | "on-request" | "on-failure" | "untrusted";
export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";
export type CodexReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export interface CodexUsage {
	input_tokens: number;
	cached_input_tokens: number;
	output_tokens: number;
}

export interface CodexAgentMessageItem {
	id: string;
	type: "agent_message";
	text: string;
}

export interface CodexReasoningItem {
	id: string;
	type: "reasoning";
	text: string;
}

export interface CodexCommandExecutionItem {
	id: string;
	type: "command_execution";
	command: string;
	aggregated_output: string;
	exit_code?: number;
	status: "in_progress" | "completed" | "failed";
}

export interface CodexFileChangeItem {
	id: string;
	type: "file_change";
	changes: Array<{ path: string; kind: "add" | "delete" | "update" }>;
	status: "completed" | "failed";
}

export interface CodexMcpToolCallItem {
	id: string;
	type: "mcp_tool_call";
	server: string;
	tool: string;
	arguments: unknown;
	result?: unknown;
	error?: { message: string };
	status: "in_progress" | "completed" | "failed";
}

export interface CodexWebSearchItem {
	id: string;
	type: "web_search";
	query: string;
}

export interface CodexTodoListItem {
	id: string;
	type: "todo_list";
	items: Array<{ text: string; completed: boolean }>;
}

export interface CodexErrorItem {
	id: string;
	type: "error";
	message: string;
}

export type CodexThreadItem =
	| CodexAgentMessageItem
	| CodexReasoningItem
	| CodexCommandExecutionItem
	| CodexFileChangeItem
	| CodexMcpToolCallItem
	| CodexWebSearchItem
	| CodexTodoListItem
	| CodexErrorItem;

export type CodexThreadEvent =
	| { type: "thread.started"; thread_id: string }
	| { type: "turn.started" }
	| { type: "turn.completed"; usage: CodexUsage }
	| { type: "turn.failed"; error: { message: string } }
	| { type: "item.started"; item: CodexThreadItem }
	| { type: "item.updated"; item: CodexThreadItem }
	| { type: "item.completed"; item: CodexThreadItem }
	| { type: "error"; message: string };

export interface CodexThreadOptions {
	model?: string;
	sandboxMode?: CodexSandboxMode;
	workingDirectory?: string;
	skipGitRepoCheck?: boolean;
	modelReasoningEffort?: CodexReasoningEffort;
	networkAccessEnabled?: boolean;
	approvalPolicy?: CodexApprovalMode;
	additionalDirectories?: string[];
}

export interface CodexTurnOptions {
	signal?: AbortSignal;
	outputSchema?: unknown;
}

export interface CodexThreadLike {
	runStreamed(
		input: string,
		turnOptions?: CodexTurnOptions,
	): Promise<{ events: AsyncGenerator<CodexThreadEvent> }>;
}

export interface CodexClientOptions {
	codexPathOverride?: string;
	baseUrl?: string;
	apiKey?: string;
	config?: Record<string, unknown>;
	env?: Record<string, string>;
}

export interface CodexClientLike {
	startThread(options?: CodexThreadOptions): CodexThreadLike;
}

export interface CodexConstructor {
	new (options?: CodexClientOptions): CodexClientLike;
}

export interface CodexSdkModule {
	Codex: CodexConstructor;
}
