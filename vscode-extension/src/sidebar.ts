import * as vscode from "vscode";
import type { GsdClient, SessionStats, ThinkingLevel } from "./gsd-client.js";

/**
 * WebviewViewProvider that renders a sidebar panel showing connection status,
 * model info, thinking level, token usage, cost, and quick action controls.
 */
export class GsdSidebarProvider implements vscode.WebviewViewProvider {
	public static readonly viewId = "gsd-sidebar";

	private view?: vscode.WebviewView;
	private disposables: vscode.Disposable[] = [];
	private refreshTimer: ReturnType<typeof setInterval> | undefined;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly client: GsdClient,
	) {
		this.disposables.push(
			client.onConnectionChange(() => this.refresh()),
			client.onEvent((evt) => {
				switch (evt.type) {
					case "agent_start":
					case "agent_end":
					case "model_switched":
					case "compaction_start":
					case "compaction_end":
					case "retry_start":
					case "retry_end":
					case "retry_error":
						this.refresh();
						break;
				}
			}),
		);
	}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	): void {
		this.view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
		};

		webviewView.webview.onDidReceiveMessage(async (msg: { command: string; value?: string }) => {
			switch (msg.command) {
				case "start":
					await vscode.commands.executeCommand("gsd.start");
					break;
				case "stop":
					await vscode.commands.executeCommand("gsd.stop");
					break;
				case "newSession":
					await vscode.commands.executeCommand("gsd.newSession");
					break;
				case "cycleModel":
					await vscode.commands.executeCommand("gsd.cycleModel");
					break;
				case "cycleThinking":
					await vscode.commands.executeCommand("gsd.cycleThinking");
					break;
				case "switchModel":
					await vscode.commands.executeCommand("gsd.switchModel");
					break;
				case "setThinking":
					await vscode.commands.executeCommand("gsd.setThinking");
					break;
				case "compact":
					await vscode.commands.executeCommand("gsd.compact");
					break;
				case "abort":
					await vscode.commands.executeCommand("gsd.abort");
					break;
				case "exportHtml":
					await vscode.commands.executeCommand("gsd.exportHtml");
					break;
				case "sessionStats":
					await vscode.commands.executeCommand("gsd.sessionStats");
					break;
				case "listCommands":
					await vscode.commands.executeCommand("gsd.listCommands");
					break;
				case "toggleAutoCompaction":
					if (this.client.isConnected) {
						const state = await this.client.getState().catch(() => null);
						if (state) {
							await this.client.setAutoCompaction(!state.autoCompactionEnabled).catch(() => {});
							this.refresh();
						}
					}
					break;
				case "toggleAutoRetry":
					if (this.client.isConnected) {
						await this.client.setAutoRetry(!this.client.autoRetryEnabled).catch(() => {});
						this.refresh();
					}
					break;
				case "setSessionName":
					await vscode.commands.executeCommand("gsd.setSessionName");
					break;
				case "copyLastResponse":
					await vscode.commands.executeCommand("gsd.copyLastResponse");
					break;
				case "autoMode":
					if (this.client.isConnected) {
						await this.client.sendPrompt("/gsd auto").catch(() => {});
					}
					break;
				case "nextUnit":
					if (this.client.isConnected) {
						await this.client.sendPrompt("/gsd next").catch(() => {});
					}
					break;
				case "quickTask": {
					const quickInput = await vscode.window.showInputBox({
						prompt: "Describe the quick task",
						placeHolder: "e.g. fix the typo in README",
					});
					if (quickInput && this.client.isConnected) {
						await this.client.sendPrompt(`/gsd quick ${quickInput}`).catch(() => {});
					}
					break;
				}
				case "capture": {
					const thought = await vscode.window.showInputBox({
						prompt: "Capture a thought",
						placeHolder: "e.g. we should also handle the edge case for...",
					});
					if (thought && this.client.isConnected) {
						await this.client.sendPrompt(`/gsd capture ${thought}`).catch(() => {});
					}
					break;
				}
				case "status":
					if (this.client.isConnected) {
						await this.client.sendPrompt("/gsd status").catch(() => {});
					}
					break;
				case "forkSession":
					await vscode.commands.executeCommand("gsd.forkSession");
					break;
				case "toggleSteeringMode":
					await vscode.commands.executeCommand("gsd.toggleSteeringMode");
					break;
				case "toggleFollowUpMode":
					await vscode.commands.executeCommand("gsd.toggleFollowUpMode");
					break;
			}
		});

		// Periodic refresh while connected (for token stats)
		this.refreshTimer = setInterval(() => {
			if (this.client.isConnected) {
				this.refresh();
			}
		}, 10_000);

		this.refresh();
	}

	async refresh(): Promise<void> {
		if (!this.view) {
			return;
		}

		let modelName = "N/A";
		let sessionId = "N/A";
		let sessionName = "";
		let messageCount = 0;
		let pendingMessageCount = 0;
		let thinkingLevel: ThinkingLevel = "off";
		let isStreaming = false;
		let isCompacting = false;
		let autoCompaction = false;
		let autoRetry = false;
		let stats: SessionStats | null = null;
		let contextWindow = 0;
		let steeringMode: "all" | "one-at-a-time" = "all";
		let followUpMode: "all" | "one-at-a-time" = "all";

		if (this.client.isConnected) {
			autoRetry = this.client.autoRetryEnabled;
			try {
				const state = await this.client.getState();
				modelName = state.model
					? `${state.model.provider}/${state.model.id}`
					: "Not set";
				sessionId = state.sessionId;
				sessionName = state.sessionName ?? "";
				messageCount = state.messageCount;
				pendingMessageCount = state.pendingMessageCount;
				thinkingLevel = state.thinkingLevel as ThinkingLevel;
				isStreaming = state.isStreaming;
				isCompacting = state.isCompacting;
				autoCompaction = state.autoCompactionEnabled;
				contextWindow = state.model?.contextWindow ?? 0;
				steeringMode = state.steeringMode;
				followUpMode = state.followUpMode;
			} catch {
				// State fetch failed, show defaults
			}

			try {
				stats = await this.client.getSessionStats();
			} catch {
				// Stats fetch failed
			}
		}

		const connected = this.client.isConnected;

		this.view.webview.html = this.getHtml({
			connected,
			modelName,
			sessionId,
			sessionName,
			messageCount,
			pendingMessageCount,
			thinkingLevel,
			isStreaming,
			isCompacting,
			autoCompaction,
			autoRetry,
			stats,
			contextWindow,
			steeringMode,
			followUpMode,
		});
	}

	dispose(): void {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer);
		}
		for (const d of this.disposables) {
			d.dispose();
		}
	}

	private getHtml(info: {
		connected: boolean;
		modelName: string;
		sessionId: string;
		sessionName: string;
		messageCount: number;
		pendingMessageCount: number;
		thinkingLevel: ThinkingLevel;
		isStreaming: boolean;
		isCompacting: boolean;
		autoCompaction: boolean;
		autoRetry: boolean;
		stats: SessionStats | null;
		contextWindow: number;
		steeringMode: "all" | "one-at-a-time";
		followUpMode: "all" | "one-at-a-time";
	}): string {
		const statusColor = info.connected ? "#4ec9b0" : "#f44747";
		const statusText = info.connected
			? info.isStreaming
				? "Processing..."
				: info.isCompacting
					? "Compacting..."
					: "Connected"
			: "Disconnected";

		const inputTokens = info.stats?.inputTokens?.toLocaleString() ?? "-";
		const outputTokens = info.stats?.outputTokens?.toLocaleString() ?? "-";
		const cacheRead = info.stats?.cacheReadTokens?.toLocaleString() ?? "-";
		const cacheWrite = info.stats?.cacheWriteTokens?.toLocaleString() ?? "-";
		const turnCount = info.stats?.turnCount?.toString() ?? "-";
		const duration = info.stats?.duration !== undefined
			? `${Math.round(info.stats.duration / 1000)}s`
			: "-";
		const cost = info.stats?.totalCost !== undefined ? `$${info.stats.totalCost.toFixed(4)}` : "-";

		const thinkingBadge = info.thinkingLevel !== "off"
			? `<span class="badge">${info.thinkingLevel}</span>`
			: `<span class="badge muted">off</span>`;

		const autoCompBadge = info.autoCompaction
			? `<span class="badge">on</span>`
			: `<span class="badge muted">off</span>`;

		const autoRetryBadge = info.autoRetry
			? `<span class="badge">on</span>`
			: `<span class="badge muted">off</span>`;

		const streamingIndicator = info.isStreaming
			? `<div class="streaming-indicator"><span class="spinner"></span> Agent is working...</div>`
			: "";

		// Context window usage
		const totalTokens = (info.stats?.inputTokens ?? 0) + (info.stats?.outputTokens ?? 0);
		const contextPct = info.contextWindow > 0 ? Math.min(100, Math.round((totalTokens / info.contextWindow) * 100)) : 0;
		const contextColor = contextPct > 80 ? "#f44747" : contextPct > 50 ? "#cca700" : "#4ec9b0";
		const contextLabel = info.contextWindow > 0
			? `${contextPct}% (${Math.round(totalTokens / 1000)}k / ${Math.round(info.contextWindow / 1000)}k)`
			: "N/A";

		const steeringBadge = info.steeringMode === "one-at-a-time"
			? `<span class="badge">1-at-a-time</span>`
			: `<span class="badge muted">all</span>`;
		const followUpBadge = info.followUpMode === "one-at-a-time"
			? `<span class="badge">1-at-a-time</span>`
			: `<span class="badge muted">all</span>`;

		const nonce = getNonce();

		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<style>
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			padding: 12px;
			margin: 0;
		}
		.status-row {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-bottom: 12px;
		}
		.status-dot {
			width: 10px;
			height: 10px;
			border-radius: 50%;
			background: ${statusColor};
			flex-shrink: 0;
		}
		.streaming-indicator {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 6px 10px;
			margin-bottom: 12px;
			background: var(--vscode-editor-background);
			border-radius: 4px;
			border: 1px solid var(--vscode-focusBorder);
			font-size: 12px;
		}
		.spinner {
			width: 12px;
			height: 12px;
			border: 2px solid var(--vscode-foreground);
			border-top-color: transparent;
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
		}
		@keyframes spin {
			to { transform: rotate(360deg); }
		}
		.section {
			margin-bottom: 14px;
		}
		.section-title {
			font-size: 11px;
			text-transform: uppercase;
			opacity: 0.6;
			margin-bottom: 6px;
			letter-spacing: 0.5px;
		}
		.info-table {
			width: 100%;
		}
		.info-table td {
			padding: 3px 0;
			vertical-align: middle;
		}
		.info-table td:first-child {
			opacity: 0.7;
			padding-right: 12px;
			white-space: nowrap;
		}
		.info-table td:last-child {
			word-break: break-all;
		}
		.badge {
			display: inline-block;
			padding: 1px 6px;
			border-radius: 3px;
			font-size: 11px;
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
		}
		.badge.muted {
			opacity: 0.5;
		}
		.badge.clickable {
			cursor: pointer;
		}
		.badge.clickable:hover {
			opacity: 0.8;
		}
		.btn-group {
			display: flex;
			flex-direction: column;
			gap: 6px;
		}
		.btn-row {
			display: flex;
			gap: 6px;
		}
		.btn-row button {
			flex: 1;
		}
		button {
			display: block;
			width: 100%;
			padding: 6px 14px;
			border: none;
			border-radius: 2px;
			cursor: pointer;
			font-size: var(--vscode-font-size);
			color: var(--vscode-button-foreground);
			background: var(--vscode-button-background);
		}
		button:hover {
			background: var(--vscode-button-hoverBackground);
		}
		button.secondary {
			color: var(--vscode-button-secondaryForeground);
			background: var(--vscode-button-secondaryBackground);
		}
		button.secondary:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}
		.token-stats {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 4px 12px;
			font-size: 12px;
		}
		.token-stats .label {
			opacity: 0.7;
		}
		.token-stats .value {
			text-align: right;
			font-variant-numeric: tabular-nums;
		}
		.context-bar-outer {
			width: 100%;
			height: 6px;
			background: var(--vscode-editor-background);
			border-radius: 3px;
			overflow: hidden;
			margin: 4px 0 2px;
		}
		.context-bar-inner {
			height: 100%;
			border-radius: 3px;
			transition: width 0.3s ease;
		}
		.context-label {
			font-size: 11px;
			opacity: 0.7;
		}
	</style>
</head>
<body>
	<div class="status-row">
		<div class="status-dot"></div>
		<strong>${statusText}</strong>
	</div>

	${streamingIndicator}

	<div class="section">
		<div class="section-title">Session</div>
		<table class="info-table">
			<tr><td>Model</td><td>${escapeHtml(info.modelName)}</td></tr>
			<tr>
				<td>Session</td>
				<td>
					${escapeHtml(info.sessionName || info.sessionId)}
					${info.connected ? `<span class="badge clickable" data-command="setSessionName" title="Rename session" style="margin-left:4px">✎</span>` : ""}
				</td>
			</tr>
			<tr><td>Messages</td><td>${info.messageCount}${info.pendingMessageCount > 0 ? ` <span class="badge muted">+${info.pendingMessageCount} pending</span>` : ""}</td></tr>
			<tr>
				<td>Thinking</td>
				<td>${thinkingBadge}</td>
			</tr>
			<tr>
				<td>Auto-compact</td>
				<td>${autoCompBadge}</td>
			</tr>
			<tr>
				<td>Auto-retry</td>
				<td>${autoRetryBadge}</td>
			</tr>
			<tr>
				<td>Steering</td>
				<td><span class="badge clickable" data-command="toggleSteeringMode">${info.steeringMode === "one-at-a-time" ? "1-at-a-time" : "all"}</span></td>
			</tr>
			<tr>
				<td>Follow-up</td>
				<td><span class="badge clickable" data-command="toggleFollowUpMode">${info.followUpMode === "one-at-a-time" ? "1-at-a-time" : "all"}</span></td>
			</tr>
		</table>
	</div>

	${info.connected && info.stats ? `
	<div class="section">
		<div class="section-title">Token Usage</div>
		<div class="token-stats">
			<span class="label">Input</span>
			<span class="value">${inputTokens}</span>
			<span class="label">Output</span>
			<span class="value">${outputTokens}</span>
			<span class="label">Cache read</span>
			<span class="value">${cacheRead}</span>
			<span class="label">Cache write</span>
			<span class="value">${cacheWrite}</span>
			<span class="label">Turns</span>
			<span class="value">${turnCount}</span>
			<span class="label">Duration</span>
			<span class="value">${duration}</span>
			<span class="label">Cost</span>
			<span class="value">${cost}</span>
		</div>
	</div>

	${info.contextWindow > 0 ? `
	<div class="section">
		<div class="section-title">Context Window</div>
		<div class="context-bar-outer">
			<div class="context-bar-inner" style="width: ${contextPct}%; background: ${contextColor};"></div>
		</div>
		<div class="context-label">${contextLabel}</div>
	</div>
	` : ""}
	` : ""}

	${info.connected ? `
	<div class="section">
		<div class="section-title">Workflow</div>
		<div class="btn-group">
			<div class="btn-row">
				<button data-command="autoMode">Auto</button>
				<button class="secondary" data-command="nextUnit">Next</button>
			</div>
			<div class="btn-row">
				<button class="secondary" data-command="quickTask">Quick</button>
				<button class="secondary" data-command="capture">Capture</button>
			</div>
			<div class="btn-row">
				<button class="secondary" data-command="status">Status</button>
				<button class="secondary" data-command="forkSession">Fork</button>
			</div>
		</div>
	</div>
	` : ""}

	<div class="section">
		<div class="section-title">Controls</div>
		<div class="btn-group">
			${info.connected
				? `<button data-command="stop">Stop Agent</button>
				   <div class="btn-row">
				     <button class="secondary" data-command="newSession">New Session</button>
				     <button class="secondary" data-command="switchModel">Model</button>
				   </div>
				   <div class="btn-row">
				     <button class="secondary" data-command="cycleThinking">Thinking</button>
				     <button class="secondary" data-command="toggleAutoCompaction">Auto-Compact</button>
				   </div>
				   <div class="btn-row">
				     <button class="secondary" data-command="toggleAutoRetry">Auto-Retry</button>
				     <button class="secondary" data-command="copyLastResponse">Copy Response</button>
				   </div>`
				: `<button data-command="start">Start Agent</button>`
			}
		</div>
	</div>

	${info.connected ? `
	<div class="section">
		<div class="section-title">Actions</div>
		<div class="btn-group">
			<div class="btn-row">
				<button class="secondary" data-command="compact">Compact</button>
				<button class="secondary" data-command="exportHtml">Export</button>
			</div>
			<div class="btn-row">
				<button class="secondary" data-command="abort">Abort</button>
				<button class="secondary" data-command="listCommands">Commands</button>
			</div>
		</div>
	</div>
	` : ""}

	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		document.addEventListener('click', (e) => {
			const btn = e.target.closest('[data-command]');
			if (btn) {
				vscode.postMessage({ command: btn.dataset.command });
			}
		});
	</script>
</body>
</html>`;
	}
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function getNonce(): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let nonce = "";
	for (let i = 0; i < 32; i++) {
		nonce += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return nonce;
}
