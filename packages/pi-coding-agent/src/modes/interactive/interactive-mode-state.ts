// @gsd/pi-coding-agent — Typed host surface shared by interactive-mode controllers
//
// This interface describes the subset of `InteractiveMode` state that controller
// modules (chat, input, model, extension-ui) read or mutate. Controllers extend
// it with their own intersection types for the additional methods they need.
//
// All imports are `import type` so this module has no runtime edges and never
// forms an import cycle with `./components/*` or `./interactive-mode.ts`.

import type { AssistantMessage } from "@gsd/pi-ai";
import type {
	Component,
	Container,
	EditorComponent,
	EditorTheme,
	Loader,
	OverlayHandle,
	OverlayOptions,
	TUI,
} from "@gsd/pi-tui";

import type { AgentSession, AgentSessionEvent } from "../../core/agent-session.js";
import type { ContextualTips } from "../../core/contextual-tips.js";
import type {
	ExtensionUIDialogOptions,
	ExtensionWidgetOptions,
	TerminalInputHandler,
} from "../../core/extensions/types.js";
import type { FooterDataProvider, ReadonlyFooterDataProvider } from "../../core/footer-data-provider.js";
import type { KeybindingsManager } from "../../core/keybindings.js";
import type { SettingsManager } from "../../core/settings-manager.js";
import type { AssistantMessageComponent } from "./components/assistant-message.js";
import type { CustomEditor } from "./components/custom-editor.js";
import type { ExtensionEditorComponent } from "./components/extension-editor.js";
import type { ExtensionInputComponent } from "./components/extension-input.js";
import type { ExtensionSelectorComponent } from "./components/extension-selector.js";
import type { FooterComponent } from "./components/footer.js";
import type { ToolExecutionComponent } from "./components/tool-execution.js";
import type { Theme } from "./theme/theme.js";

export interface CompactionQueuedMessage {
	text: string;
	mode: "steer" | "followUp";
}

export interface InteractiveModeStateHost {
	// Core references
	session: AgentSession;
	ui: TUI;
	keybindings: KeybindingsManager;
	settingsManager: SettingsManager;
	contextualTips: ContextualTips;
	options?: { submitPromptsDirectly?: boolean };

	// Containers
	chatContainer: Container;
	pendingMessagesContainer: Container;
	statusContainer: Container;
	pinnedMessageContainer: Container;
	editorContainer: Container;

	// Editor
	defaultEditor: CustomEditor;
	editor: EditorComponent;

	// Footer
	footer: FooterComponent;
	footerDataProvider: FooterDataProvider;

	// Lifecycle
	isInitialized: boolean;

	// Input loop
	onInputCallback?: (text: string) => void;
	isBashMode: boolean;

	// Streaming assistant message
	streamingComponent?: AssistantMessageComponent;
	streamingMessage?: AssistantMessage;

	// Tool execution tracking
	pendingTools: Map<string, ToolExecutionComponent>;
	toolOutputExpanded: boolean;
	hideThinkingBlock: boolean;

	// Loading / working indicators
	loadingAnimation?: Loader;
	pendingWorkingMessage?: string;
	readonly defaultWorkingMessage: string;

	// Retry indicator
	retryLoader?: Loader;
	retryEscapeHandler?: () => void;

	// Auto-compaction indicator
	autoCompactionLoader?: Loader;
	autoCompactionEscapeHandler?: () => void;
	compactionQueuedMessages: CompactionQueuedMessage[];

	// Extension overlays
	extensionSelector?: ExtensionSelectorComponent;
	extensionInput?: ExtensionInputComponent;
	extensionEditor?: ExtensionEditorComponent;
}

export type InteractiveModeEvent = AgentSessionEvent;

// ---------------------------------------------------------------------------
// Controller host extensions — each controller extends the base with the
// specific methods it calls on the host. Colocated here so all controller
// surfaces are visible in one place.
// ---------------------------------------------------------------------------

export type ModelControllerHost = InteractiveModeStateHost & {
	showModelSelector(initialSearchInput?: string): void;
	checkDaxnutsEasterEgg(model: { provider: string; id: string }): void;
	updateEditorBorderColor(): void;
	showStatus(message: string, options?: { append?: boolean }): void;
	showError(message: string): void;
};

export type ExtensionUIControllerHost = InteractiveModeStateHost & {
	showExtensionSelector(
		title: string,
		options: string[],
		opts?: ExtensionUIDialogOptions,
	): Promise<string | undefined>;
	showExtensionConfirm(
		title: string,
		message: string,
		opts?: ExtensionUIDialogOptions,
	): Promise<boolean>;
	showExtensionInput(
		title: string,
		placeholder?: string,
		opts?: ExtensionUIDialogOptions,
	): Promise<string | undefined>;
	showExtensionNotify(
		message: string,
		type?: "info" | "warning" | "error" | "success",
	): void;
	showExtensionEditor(title: string, prefill?: string): Promise<string | undefined>;
	showExtensionCustom<T>(
		factory: (
			tui: TUI,
			theme: Theme,
			keybindings: KeybindingsManager,
			done: (result: T) => void,
		) => (Component & { dispose?(): void }) | Promise<Component & { dispose?(): void }>,
		options?: {
			overlay?: boolean;
			overlayOptions?: OverlayOptions | (() => OverlayOptions);
			onHandle?: (handle: OverlayHandle) => void;
		},
	): Promise<T>;
	addExtensionTerminalInputListener(handler: TerminalInputHandler): () => void;
	setExtensionStatus(key: string, text: string | undefined): void;
	setExtensionWidget(
		key: string,
		content: string[] | ((tui: TUI, thm: Theme) => Component & { dispose?(): void }) | undefined,
		options?: ExtensionWidgetOptions,
	): void;
	setExtensionFooter(
		factory:
			| ((tui: TUI, thm: Theme, footerData: ReadonlyFooterDataProvider) => Component & { dispose?(): void })
			| undefined,
	): void;
	setExtensionHeader(
		factory: ((tui: TUI, thm: Theme) => Component & { dispose?(): void }) | undefined,
	): void;
	setCustomEditorComponent(
		factory:
			| ((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => EditorComponent)
			| undefined,
	): void;
	setToolsExpanded(expanded: boolean): void;
};
