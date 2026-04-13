import { Loader, Markdown, Spacer, Text } from "@gsd/pi-tui";

import type { InteractiveModeEvent, InteractiveModeStateHost } from "../interactive-mode-state.js";
import { theme } from "../theme/theme.js";
import { AssistantMessageComponent } from "../components/assistant-message.js";
import { ToolExecutionComponent } from "../components/tool-execution.js";
import { DynamicBorder } from "../components/dynamic-border.js";
import { appKey } from "../components/keybinding-hints.js";

// Tracks the last processed content index to avoid re-scanning all blocks on every message_update
let lastProcessedContentIndex = 0;

function hasVisibleAssistantContent(message: { content: Array<any> }): boolean {
	return message.content.some(
		(c) =>
			(c.type === "text" && typeof c.text === "string" && c.text.trim().length > 0)
			|| (c.type === "thinking" && typeof c.thinking === "string" && c.thinking.trim().length > 0),
	);
}

function hasAssistantToolBlocks(message: { content: Array<any> }): boolean {
	return message.content.some((c) => c.type === "toolCall" || c.type === "serverToolUse");
}

// Pick the latest non-empty text block that appears strictly before the most
// recent tool call. Text blocks that come after the last tool call are still
// streaming live into the chat container, so mirroring them into the pinned
// "Latest Output" zone would render the same tokens twice.
export function findLatestPinnableText(contentBlocks: Array<any>): string {
	let lastToolIdx = -1;
	for (let i = contentBlocks.length - 1; i >= 0; i--) {
		const c = contentBlocks[i];
		if (c?.type === "toolCall" || c?.type === "serverToolUse") {
			lastToolIdx = i;
			break;
		}
	}
	for (let i = lastToolIdx - 1; i >= 0; i--) {
		const c = contentBlocks[i];
		if (c?.type === "text" && typeof c.text === "string" && c.text.trim()) {
			return c.text.trim();
		}
	}
	return "";
}

// Tracks the latest assistant text for the pinned message zone
let lastPinnedText = "";
// Whether any tool execution has been added in this assistant turn (triggers pinned display)
let hasToolsInTurn = false;
// Reference to the pinned border so we can toggle its label between working/idle
let pinnedBorder: DynamicBorder | undefined;
// Reference to the pinned markdown component below the border
let pinnedTextComponent: Markdown | undefined;

export async function handleAgentEvent(host: InteractiveModeStateHost & {
	init: () => Promise<void>;
	getMarkdownThemeWithSettings: () => any;
	addMessageToChat: (message: any, options?: any) => void;
	formatWebSearchResult: (content: unknown) => string;
	getRegisteredToolDefinition: (toolName: string) => any;
	checkShutdownRequested: () => Promise<void>;
	rebuildChatFromMessages: () => void;
	flushCompactionQueue: (options?: { willRetry?: boolean }) => Promise<void>;
	showStatus: (message: string) => void;
	showError: (message: string) => void;
	updatePendingMessagesDisplay: () => void;
	updateTerminalTitle: () => void;
	updateEditorBorderColor: () => void;
	pendingMessagesContainer: { clear: () => void };
}, event: InteractiveModeEvent): Promise<void> {
	if (!host.isInitialized) {
		await host.init();
	}

	host.footer.invalidate();

	// Reset content index tracker and pinned state when a new assistant message starts
	if (event.type === "message_start" && event.message.role === "assistant") {
		lastProcessedContentIndex = 0;
		lastPinnedText = "";
		hasToolsInTurn = false;
		if (pinnedBorder) pinnedBorder.stopSpinner();
		pinnedBorder = undefined;
		pinnedTextComponent = undefined;
		host.pinnedMessageContainer.clear();
	}

	switch (event.type) {
		case "session_state_changed":
			switch (event.reason) {
				case "new_session":
				case "switch_session":
				case "fork":
					host.streamingComponent = undefined;
					host.streamingMessage = undefined;
					host.pendingTools.clear();
					host.pendingMessagesContainer.clear();
					host.pinnedMessageContainer.clear();
					lastPinnedText = "";
					hasToolsInTurn = false;
					if (pinnedBorder) pinnedBorder.stopSpinner();
					pinnedBorder = undefined;
					pinnedTextComponent = undefined;
					host.compactionQueuedMessages = [];
					host.rebuildChatFromMessages();
					host.updatePendingMessagesDisplay();
					host.updateTerminalTitle();
					host.updateEditorBorderColor();
					host.ui.requestRender();
					return;
				case "set_session_name":
					host.updateTerminalTitle();
					host.ui.requestRender();
					return;
				case "set_model":
				case "set_thinking_level":
					host.updateEditorBorderColor();
					host.ui.requestRender();
					return;
				default:
					host.ui.requestRender();
					return;
			}
		case "agent_start":
			if (host.retryEscapeHandler) {
				host.defaultEditor.onEscape = host.retryEscapeHandler;
				host.retryEscapeHandler = undefined;
			}
			if (host.retryLoader) {
				host.retryLoader.stop();
				host.retryLoader = undefined;
			}
			if (host.loadingAnimation) {
				host.loadingAnimation.stop();
			}
			host.statusContainer.clear();
			host.loadingAnimation = new Loader(
				host.ui,
				(spinner) => theme.fg("accent", spinner),
				(text) => theme.fg("muted", text),
				host.defaultWorkingMessage,
			);
			host.statusContainer.addChild(host.loadingAnimation);
			if (host.pendingWorkingMessage !== undefined) {
				if (host.pendingWorkingMessage) {
					host.loadingAnimation.setMessage(host.pendingWorkingMessage);
				}
				host.pendingWorkingMessage = undefined;
			}
			host.ui.requestRender();
			break;

		case "message_start":
			if (event.message.role === "custom") {
				host.addMessageToChat(event.message);
				host.ui.requestRender();
			} else if (event.message.role === "user") {
				host.addMessageToChat(event.message);
				host.updatePendingMessagesDisplay();
				host.ui.requestRender();
			} else if (event.message.role === "assistant") {
				host.streamingMessage = event.message;
				// External-tool providers can stream multiple assistant turns through
				// one response. Delay component creation until visible assistant text
				// arrives so tool outputs keep chronological ordering.
				host.ui.requestRender();
			}
			break;

		case "message_update":
			if (event.message.role === "assistant") {
				host.streamingMessage = event.message;
				const innerEvent = event.assistantMessageEvent;

				let externalToolResult:
					| { toolCallId: string; content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; details: Record<string, unknown>; isError: boolean }
					| undefined;
				if (innerEvent.type === "toolcall_end" && innerEvent.toolCall) {
					const tc = innerEvent.toolCall as any;
					const ext = tc.externalResult;
					if (ext) {
						externalToolResult = {
							toolCallId: tc.id,
							content: ext.content ?? [{ type: "text", text: "" }],
							details: ext.details ?? {},
							isError: ext.isError ?? false,
						};
					}
				} else if (innerEvent.type === "server_tool_use") {
					const idx = typeof innerEvent.contentIndex === "number" ? innerEvent.contentIndex : -1;
					const block = idx >= 0 ? (host.streamingMessage.content[idx] as any) : undefined;
					const ext = block?.externalResult;
					if (block?.id && ext) {
						externalToolResult = {
							toolCallId: block.id,
							content: ext.content ?? [{ type: "text", text: "" }],
							details: ext.details ?? {},
							isError: ext.isError ?? false,
						};
					}
				}

				const contentBlocks = host.streamingMessage.content;
				// Some adapters reuse a single assistant lifecycle while internally
				// spanning multiple provider turns. When a new turn starts, content
				// length can shrink back to 0/1; reset scan index to avoid skipping.
				if (lastProcessedContentIndex >= contentBlocks.length) {
					lastProcessedContentIndex = 0;
				}
				for (let i = lastProcessedContentIndex; i < contentBlocks.length; i++) {
					const content = contentBlocks[i];
					if (content.type === "toolCall") {
						if (!host.pendingTools.has(content.id)) {
							const component = new ToolExecutionComponent(
								content.name,
								content.arguments,
								{ showImages: host.settingsManager.getShowImages() },
								host.getRegisteredToolDefinition(content.name),
								host.ui,
							);
							component.setExpanded(host.toolOutputExpanded);
							host.chatContainer.addChild(component);
							host.pendingTools.set(content.id, component);
						} else {
							host.pendingTools.get(content.id)?.updateArgs(content.arguments);
						}
					} else if (content.type === "serverToolUse") {
						if (!host.pendingTools.has(content.id)) {
							const component = new ToolExecutionComponent(
								content.name,
								content.input ?? {},
								{ showImages: host.settingsManager.getShowImages() },
								undefined,
								host.ui,
							);
							component.setExpanded(host.toolOutputExpanded);
							host.chatContainer.addChild(component);
							host.pendingTools.set(content.id, component);
						}
					} else if (content.type === "webSearchResult") {
						const component = host.pendingTools.get(content.toolUseId);
						if (component) {
							if (process.env.PI_OFFLINE === "1") {
								component.updateResult({
									content: [{ type: "text", text: "Web search disabled (offline mode)" }],
									isError: false,
								});
							} else {
								const searchContent = content.content;
								const isError = searchContent && typeof searchContent === "object" && "type" in (searchContent as any) && (searchContent as any).type === "web_search_tool_result_error";
								component.updateResult({
									content: [{ type: "text", text: host.formatWebSearchResult(searchContent) }],
									isError: !!isError,
								});
							}
						}
					}
				}

				// When the stream adapter signals a completed tool call with an
				// external result (from Claude Code SDK), update the pending
				// ToolExecutionComponent immediately so output is visible in
				// real-time instead of waiting for the session to end.
				if (externalToolResult) {
					const component = host.pendingTools.get(externalToolResult.toolCallId);
					if (component) {
						component.updateResult({
							content: externalToolResult.content,
							details: externalToolResult.details,
							isError: externalToolResult.isError,
						});
					}
				}

				// Render assistant text/thinking after tool components so mixed
				// streams keep chronological ordering in the chat container.
				const hasToolBlocks = hasAssistantToolBlocks(host.streamingMessage);
				if (!host.streamingComponent && hasVisibleAssistantContent(host.streamingMessage)) {
					host.streamingComponent = new AssistantMessageComponent(
						undefined,
						host.hideThinkingBlock,
						host.getMarkdownThemeWithSettings(),
						host.settingsManager.getTimestampFormat(),
					);
					host.chatContainer.addChild(host.streamingComponent);
				}
				if (host.streamingComponent) {
					if (hasToolBlocks) {
						host.chatContainer.removeChild(host.streamingComponent);
						host.chatContainer.addChild(host.streamingComponent);
					}
					host.streamingComponent.updateContent(host.streamingMessage);
				}

				// Update index: fully processed blocks won't need re-scanning.
				// Keep the last block's index (it may still be accumulating data),
				// so we re-check it next time but skip all earlier ones.
				if (contentBlocks.length > 0) {
					lastProcessedContentIndex = Math.max(0, contentBlocks.length - 1);
				}

				// Pinned message: mirror the latest assistant text above the editor
				// when tool executions push it out of the viewport.
				const hasTools = contentBlocks.some(
					(c: any) => c.type === "toolCall" || c.type === "serverToolUse",
				);
				if (hasTools) hasToolsInTurn = true;

				if (hasToolsInTurn) {
					const latestText = findLatestPinnableText(contentBlocks);

					if (latestText && latestText !== lastPinnedText) {
						lastPinnedText = latestText;

						if (!pinnedBorder) {
							// First time: create border + text component
							host.pinnedMessageContainer.clear();
							pinnedBorder = new DynamicBorder(
								(str: string) => theme.fg("dim", str),
								"Working · Latest Output",
							);
							pinnedBorder.startSpinner(host.ui, (str: string) => theme.fg("accent", str));
							host.pinnedMessageContainer.addChild(pinnedBorder);
							pinnedTextComponent = new Markdown(latestText, 1, 0, host.getMarkdownThemeWithSettings());
							// Cap pinned content to ~40% of terminal height so tall output
							// doesn't exceed the viewport and cause render flashing.
							pinnedTextComponent.maxLines = Math.max(3, Math.floor(host.ui.terminal.rows * 0.4));
							host.pinnedMessageContainer.addChild(pinnedTextComponent);
							// Hide the separate status loader — the pinned zone replaces it
							if (host.loadingAnimation) {
								host.loadingAnimation.stop();
								host.loadingAnimation = undefined;
							}
							host.statusContainer.clear();
						} else {
							// Update existing markdown component in-place
							pinnedTextComponent?.setText(latestText);
							// Refresh maxLines in case terminal was resized
							if (pinnedTextComponent) {
								pinnedTextComponent.maxLines = Math.max(3, Math.floor(host.ui.terminal.rows * 0.4));
							}
						}
					}
				}

				host.ui.requestRender();
			}
			break;

		case "message_end":
			if (event.message.role === "user") break;
			if (event.message.role === "assistant") {
				host.streamingMessage = event.message;
				let errorMessage: string | undefined;
				if (host.streamingMessage.stopReason === "aborted") {
					const retryAttempt = host.session.retryAttempt;
					errorMessage = retryAttempt > 0
						? `Aborted after ${retryAttempt} retry attempt${retryAttempt > 1 ? "s" : ""}`
						: "Operation aborted";
					host.streamingMessage.errorMessage = errorMessage;
				}

				const shouldRenderAssistant = hasVisibleAssistantContent(host.streamingMessage)
					|| (
						(host.streamingMessage.stopReason === "aborted" || host.streamingMessage.stopReason === "error")
						&& !hasAssistantToolBlocks(host.streamingMessage)
					);
				if (!host.streamingComponent && shouldRenderAssistant) {
					host.streamingComponent = new AssistantMessageComponent(
						undefined,
						host.hideThinkingBlock,
						host.getMarkdownThemeWithSettings(),
						host.settingsManager.getTimestampFormat(),
					);
					host.chatContainer.addChild(host.streamingComponent);
				}
				if (host.streamingComponent) {
					host.streamingComponent.updateContent(host.streamingMessage);
				}

				if (host.streamingMessage.stopReason === "aborted" || host.streamingMessage.stopReason === "error") {
					if (!errorMessage) {
						errorMessage = host.streamingMessage.errorMessage || "Error";
					}
					const pendingComponents = Array.from(host.pendingTools.values());
					if (pendingComponents.length > 0) {
						const [first, ...rest] = pendingComponents;
						first.completeWithError(errorMessage);
						for (const component of rest) {
							component.completeWithError();
						}
					}
					host.pendingTools.clear();
				} else {
					for (const [, component] of host.pendingTools.entries()) {
						component.setArgsComplete();
					}
				}
				host.streamingComponent = undefined;
				host.streamingMessage = undefined;
				// Clear pinned output once the message is finalized in the chat
				// container — prevents duplicate display when the agent continues
				// (e.g. form elicitation) after the assistant message ends.
				if (pinnedBorder) pinnedBorder.stopSpinner();
				host.pinnedMessageContainer.clear();
				lastPinnedText = "";
				hasToolsInTurn = false;
				pinnedBorder = undefined;
				pinnedTextComponent = undefined;
				host.footer.invalidate();
			}
			host.ui.requestRender();
			break;

		case "tool_execution_start":
			if (!host.pendingTools.has(event.toolCallId)) {
				const component = new ToolExecutionComponent(
					event.toolName,
					event.args,
					{ showImages: host.settingsManager.getShowImages() },
					host.getRegisteredToolDefinition(event.toolName),
					host.ui,
				);
				component.setExpanded(host.toolOutputExpanded);
				host.chatContainer.addChild(component);
				host.pendingTools.set(event.toolCallId, component);
				host.ui.requestRender();
			}
			break;

		case "tool_execution_update": {
			const component = host.pendingTools.get(event.toolCallId);
			if (component) {
				component.updateResult({ ...event.partialResult, isError: false }, true);
				host.ui.requestRender();
			}
			break;
		}

		case "tool_execution_end": {
			const component = host.pendingTools.get(event.toolCallId);
			if (component) {
				component.updateResult({ ...event.result, isError: event.isError });
				host.pendingTools.delete(event.toolCallId);
				host.ui.requestRender();
			}
			break;
		}

		case "agent_end":
			if (host.loadingAnimation) {
				host.loadingAnimation.stop();
				host.loadingAnimation = undefined;
				host.statusContainer.clear();
			}
			if (host.streamingComponent) {
				host.chatContainer.removeChild(host.streamingComponent);
				host.streamingComponent = undefined;
				host.streamingMessage = undefined;
			}
			host.pendingTools.clear();
			// Pinned output is only useful while work is actively streaming.
			// Keep chat history as the single source after completion.
			if (pinnedBorder) {
				pinnedBorder.stopSpinner();
			}
			host.pinnedMessageContainer.clear();
			lastPinnedText = "";
			hasToolsInTurn = false;
			pinnedBorder = undefined;
			pinnedTextComponent = undefined;
			await host.checkShutdownRequested();
			host.ui.requestRender();
			break;

		case "auto_compaction_start":
			host.autoCompactionEscapeHandler = host.defaultEditor.onEscape;
			host.defaultEditor.onEscape = () => host.session.abortCompaction();
			host.statusContainer.clear();
			host.autoCompactionLoader = new Loader(
				host.ui,
				(spinner) => theme.fg("accent", spinner),
				(text) => theme.fg("muted", text),
				`${event.reason === "overflow" ? "Context overflow detected, " : ""}Auto-compacting... (${appKey(host.keybindings, "interrupt")} to cancel)`,
			);
			host.statusContainer.addChild(host.autoCompactionLoader);
			host.ui.requestRender();
			break;

		case "auto_compaction_end":
			if (host.autoCompactionEscapeHandler) {
				host.defaultEditor.onEscape = host.autoCompactionEscapeHandler;
				host.autoCompactionEscapeHandler = undefined;
			}
			if (host.autoCompactionLoader) {
				host.autoCompactionLoader.stop();
				host.autoCompactionLoader = undefined;
				host.statusContainer.clear();
			}
			if (event.aborted) {
				host.showStatus("Auto-compaction cancelled");
			} else if (event.result) {
				host.chatContainer.clear();
				host.rebuildChatFromMessages();
				host.addMessageToChat({
					role: "compactionSummary",
					tokensBefore: event.result.tokensBefore,
					summary: event.result.summary,
					timestamp: Date.now(),
				});
				host.footer.invalidate();
			} else if (event.errorMessage) {
				host.chatContainer.addChild(new Spacer(1));
				host.chatContainer.addChild(new Text(theme.fg("error", event.errorMessage), 1, 0));
			}
			void host.flushCompactionQueue({ willRetry: event.willRetry });
			host.ui.requestRender();
			break;

		case "auto_retry_start":
			host.retryEscapeHandler = host.defaultEditor.onEscape;
			host.defaultEditor.onEscape = () => host.session.abortRetry();
			host.statusContainer.clear();
			host.retryLoader = new Loader(
				host.ui,
				(spinner) => theme.fg("warning", spinner),
				(text) => theme.fg("muted", text),
				`Retrying (${event.attempt}/${event.maxAttempts}) in ${Math.round(event.delayMs / 1000)}s... (${appKey(host.keybindings, "interrupt")} to cancel)`,
			);
			host.statusContainer.addChild(host.retryLoader);
			host.ui.requestRender();
			break;

		case "auto_retry_end":
			if (host.retryEscapeHandler) {
				host.defaultEditor.onEscape = host.retryEscapeHandler;
				host.retryEscapeHandler = undefined;
			}
			if (host.retryLoader) {
				host.retryLoader.stop();
				host.retryLoader = undefined;
				host.statusContainer.clear();
			}
			if (!event.success) {
				host.showError(`Retry failed after ${event.attempt} attempts: ${event.finalError || "Unknown error"}`);
			}
			host.ui.requestRender();
			break;

		case "fallback_provider_switch":
			host.showStatus(`Switched from ${event.from} → ${event.to} (${event.reason})`);
			host.ui.requestRender();
			break;

		case "fallback_provider_restored":
			host.showStatus(`Restored to ${event.provider}`);
			host.ui.requestRender();
			break;

		case "fallback_chain_exhausted":
			host.showError(event.reason);
			host.ui.requestRender();
			break;

		case "image_overflow_recovery":
			host.showStatus(
				`Removed ${event.strippedCount} older image(s) to comply with API limits. Retrying...`,
			);
			host.ui.requestRender();
			break;
	}
}
