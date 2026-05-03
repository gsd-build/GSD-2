import type { ExtensionUIContext } from "../../../core/extensions/index.js";

import { Theme, getAvailableThemesWithPaths, getThemeByName, setTheme, setThemeInstance, theme } from "../theme/theme.js";
import { appKey } from "../components/keybinding-hints.js";

export function createExtensionUIContext(host: any): ExtensionUIContext {
	return {
		select: (title, options, opts) => host.showExtensionSelector(title, options, opts),
		askInterview: async (questions, opts) => {
			// Cross-package dynamic import: pi-coding-agent's tsconfig has
			// rootDir: ./src, so a literal-string import path would trip
			// TS6059. Indirecting through a variable hides the path from
			// tsc's static analysis (same trick stream-adapter.ts uses for
			// the SDK).
			const interviewUiPath = "../../../../../../src/resources/extensions/shared/interview-ui.js";
			let showInterviewRound: (
				questions: unknown,
				opts: { signal?: AbortSignal },
				ctx: { ui: { custom: unknown } },
			) => Promise<unknown>;
			try {
				const mod = (await import(/* webpackIgnore: true */ interviewUiPath)) as {
					showInterviewRound: typeof showInterviewRound;
				};
				showInterviewRound = mod.showInterviewRound;
			} catch (err) {
				host.showExtensionNotify?.(
					`AskUserQuestion: TUI interview surface unavailable (${err instanceof Error ? err.message : String(err)})`,
					"warning",
				);
				return undefined;
			}
			try {
				const result = await showInterviewRound(
					questions as unknown,
					{ signal: opts?.signal },
					{ ui: { custom: host.showExtensionCustom.bind(host) } },
				);
				return result as any;
			} catch (err) {
				host.showExtensionNotify?.(
					`AskUserQuestion: interview rendering failed (${err instanceof Error ? err.message : String(err)})`,
					"warning",
				);
				return undefined;
			}
		},
		confirm: (title, message, opts) => host.showExtensionConfirm(title, message, opts),
		input: (title, placeholder, opts) => host.showExtensionInput(title, placeholder, opts),
		notify: (message, type) => host.showExtensionNotify(message, type),
		onTerminalInput: (handler) => host.addExtensionTerminalInputListener(handler),
		setStatus: (key, text) => host.setExtensionStatus(key, text),
		setWorkingMessage: (message) => {
			if (host.loadingAnimation) {
				if (message) {
					host.loadingAnimation.setMessage(message);
				} else {
					host.loadingAnimation.setMessage(`${host.defaultWorkingMessage} (${appKey(host.keybindings, "interrupt")} to interrupt)`);
				}
			} else {
				host.pendingWorkingMessage = message;
			}
		},
		setWidget: (key, content, options) => host.setExtensionWidget(key, content, options),
		setFooter: (factory) => host.setExtensionFooter(factory),
		setHeader: (factory) => host.setExtensionHeader(factory),
		setTitle: (title) => host.ui.terminal.setTitle(title),
		custom: (factory, options) => host.showExtensionCustom(factory, options),
		pasteToEditor: (text) => host.editor.handleInput(`\x1b[200~${text}\x1b[201~`),
		setEditorText: (text) => host.editor.setText(text),
		getEditorText: () => host.editor.getText(),
		editor: (title, prefill) => host.showExtensionEditor(title, prefill),
		setEditorComponent: (factory) => host.setCustomEditorComponent(factory),
		get theme() {
			return theme;
		},
		getAllThemes: () => getAvailableThemesWithPaths(),
		getTheme: (name) => getThemeByName(name),
		setTheme: (themeOrName) => {
			if (themeOrName instanceof Theme) {
				setThemeInstance(themeOrName);
				host.ui.requestRender();
				return { success: true };
			}
			const result = setTheme(themeOrName, true);
			if (result.success) {
				if (host.settingsManager.getTheme() !== themeOrName) {
					host.settingsManager.setTheme(themeOrName);
				}
				host.ui.requestRender();
			}
			return result;
		},
		getToolsExpanded: () => host.toolOutputExpanded,
		setToolsExpanded: (expanded) => host.setToolsExpanded(expanded),
	};
}

