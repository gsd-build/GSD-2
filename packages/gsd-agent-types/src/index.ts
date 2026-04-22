// GSD-originated types (no pi-mono counterpart — owned by GSD)
// Moved from packages/gsd-agent-core/src/lifecycle-hook-types.ts
import type { ImageContent, TextContent } from "@gsd/pi-ai";

export type LifecycleHookPhase = string;
export type LifecycleHookScope = "project" | "user";
export interface LifecycleHookContext {
    phase: LifecycleHookPhase;
    source: string;
    installedPath?: string;
    scope: LifecycleHookScope;
    cwd: string;
    interactive: boolean;
    log: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}
export type LifecycleHookHandler = (context: LifecycleHookContext) => void | Promise<void>;
export type LifecycleHookMap = Partial<Record<LifecycleHookPhase, LifecycleHookHandler[]>>;

// Pi-originated types (re-exported from @gsd/pi-coding-agent public API)
export type { ToolInfo } from "@gsd/pi-coding-agent";
export type { PathMetadata as SourceInfo } from "@gsd/pi-coding-agent";
export type { PackageManager } from "@gsd/pi-coding-agent";
export type { AuthStorage } from "@gsd/pi-coding-agent";
export type { ModelRegistry } from "@gsd/pi-coding-agent";
export type { SettingsManager } from "@gsd/pi-coding-agent";
export type { ExtensionRunner } from "@gsd/pi-coding-agent";
export type { CompactionEntry } from "@gsd/pi-coding-agent";
export type { SessionManager } from "@gsd/pi-coding-agent";
export type { BashOperations } from "@gsd/pi-coding-agent";
export type { Theme } from "@gsd/pi-coding-agent";
export type { ToolDefinition } from "@gsd/pi-coding-agent";
export type { SessionEntry } from "@gsd/pi-coding-agent";
export type { LoadExtensionsResult } from "@gsd/pi-coding-agent";
export type { ResourceLoader } from "@gsd/pi-coding-agent";
export type { BranchSummaryEntry } from "@gsd/pi-coding-agent";
export type { SlashCommandInfo } from "@gsd/pi-coding-agent";
export type { ExtensionCommandContextActions } from "@gsd/pi-coding-agent";
export type { AppAction } from "@gsd/pi-coding-agent";
export type { SessionInfo } from "@gsd/pi-coding-agent";
export type { CompactionResult } from "@gsd/pi-coding-agent";
export type { ResourceDiagnostic } from "@gsd/pi-coding-agent";
export type { TruncationResult } from "@gsd/pi-coding-agent";
export type { ReadonlyFooterDataProvider } from "@gsd/pi-coding-agent";
export type { AgentSession } from "@gsd/pi-coding-agent";
export type { PathMetadata } from "@gsd/pi-coding-agent";
export type { ResolvedPaths } from "@gsd/pi-coding-agent";
export type { ResolvedResource } from "@gsd/pi-coding-agent";
export type { PackageSource } from "@gsd/pi-coding-agent";
export type { MessageRenderer } from "@gsd/pi-coding-agent";
export type { ParsedSkillBlock } from "@gsd/pi-coding-agent";
export type { SessionStats } from "@gsd/pi-coding-agent";
export type { ExtensionUIContext } from "@gsd/pi-coding-agent";
export type { ExtensionUIDialogOptions } from "@gsd/pi-coding-agent";
export type { ExtensionWidgetOptions } from "@gsd/pi-coding-agent";
export type { PromptTemplate } from "@gsd/pi-coding-agent";
export type { Skill } from "@gsd/pi-coding-agent";
export type { ExtensionAPI } from "@gsd/pi-coding-agent";
export type { ExtensionCommandContext } from "@gsd/pi-coding-agent";
export type { ExtensionContext } from "@gsd/pi-coding-agent";
export type { ExtensionFactory } from "@gsd/pi-coding-agent";
export type { SlashCommandSource } from "@gsd/pi-coding-agent";
export type { SessionContext } from "@gsd/pi-coding-agent";

export interface BashExecutionMessage {
	role: "bashExecution";
	command: string;
	output: string;
	exitCode: number | undefined;
	cancelled: boolean;
	truncated: boolean;
	fullOutputPath?: string;
	timestamp: number;
	excludeFromContext?: boolean;
}

export interface CustomMessage<T = unknown> {
	role: "custom";
	customType: string;
	content: string | (TextContent | ImageContent)[];
	display: boolean;
	details?: T;
	timestamp: number;
}

export interface BranchSummaryMessage {
	role: "branchSummary";
	summary: string;
	fromId: string;
	timestamp: number;
}

export interface CompactionSummaryMessage {
	role: "compactionSummary";
	summary: string;
	tokensBefore: number;
	timestamp: number;
}

export interface ResourceExtensionPaths {
	skillPaths?: Array<{ path: string; metadata: import("@gsd/pi-coding-agent").PathMetadata }>;
	promptPaths?: Array<{ path: string; metadata: import("@gsd/pi-coding-agent").PathMetadata }>;
	themePaths?: Array<{ path: string; metadata: import("@gsd/pi-coding-agent").PathMetadata }>;
}

export interface BashResult {
	output: string;
	exitCode: number | undefined;
	cancelled: boolean;
	truncated: boolean;
	fullOutputPath?: string;
}

export type ToolName =
	| "read"
	| "bash"
	| "edit"
	| "write"
	| "grep"
	| "find"
	| "ls"
	| "lsp"
	| "hashline_edit"
	| "hashline_read";

export type Tool = import("@gsd/pi-agent-core").AgentTool;

export interface ContextualTips {
	recordBashIncluded(): void;
	evaluate(input: { input: string; isStreaming: boolean; thinkingLevel: string; contextPercent?: number }): string | null;
}

export interface EditDiffResult {
	diff: string;
	firstChangedLine: number | undefined;
}

export interface EditDiffError {
	error: string;
}

// ============================================================================
// GSD utility types and helpers (no pi-mono counterpart)
// ============================================================================

/**
 * Assertion that the type checker should reach this point with `never`.
 * Throws at runtime if somehow reached; tells TypeScript the branch is unreachable.
 * Usage: default: assertNever(value); in switch over union type.
 */
export function assertNever(x: never): never {
    throw new Error(`Unexpected value reached assertNever: ${String(x)}`);
}

// Runtime-only content block types for pi-ai streaming responses.
// These types are not in the pi-ai public API but appear at runtime.
export interface ServerToolUseBlock {
    type: "serverToolUse";
    id?: string;
    name: string;
    input: Record<string, unknown>;
}

export interface WebSearchResultBlock {
    type: "webSearchResult";
    toolUseId?: string;
    url?: string;
    title?: string;
    content?: unknown;
}

export function isServerToolUseBlock(content: unknown): content is ServerToolUseBlock {
    return (
        typeof content === "object" &&
        content !== null &&
        "type" in content &&
        (content as { type: unknown }).type === "serverToolUse"
    );
}

export function isWebSearchResultBlock(content: unknown): content is WebSearchResultBlock {
    return (
        typeof content === "object" &&
        content !== null &&
        "type" in content &&
        (content as { type: unknown }).type === "webSearchResult"
    );
}

/**
 * Structural interface for AgentSession to avoid dual-module-path TS2345.
 * Use this in GSD-owned function signatures that accept a session object.
 * The actual AgentSession from pi-coding-agent satisfies this structurally.
 */
export interface GSDAgentSession {
    readonly agent: { state: { tools?: unknown[] } };
    readonly settingsManager: import("@gsd/pi-coding-agent").SettingsManager;
    model: import("@gsd/pi-coding-agent").ToolInfo | null | undefined;
    thinkingLevel: string;
    setModel(model: import("@gsd/pi-coding-agent").ToolInfo | null): Promise<void> | void;
    setThinkingLevel(level: string): void;
    getAllTools(): Array<{ name: string }>;
    setActiveToolsByName(names: string[]): void;
    setScopedModels(models: Array<{ model: import("@gsd/pi-coding-agent").ToolInfo; thinkingLevel?: string }>): void;
}
