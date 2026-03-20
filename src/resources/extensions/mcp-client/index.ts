/**
 * MCP Client Extension — Native MCP server integration for pi
 *
 * Provides on-demand access to MCP servers configured in project files
 * (.mcp.json, .gsd/mcp.json) using the @modelcontextprotocol/sdk Client
 * directly — no external CLI dependency required.
 *
 * Three tools:
 *   mcp_servers   — List available MCP servers from config files
 *   mcp_discover  — Get tool signatures for a specific server (lazy connect)
 *   mcp_call      — Call a tool on an MCP server (lazy connect)
 */

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import {
	truncateHead,
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
} from "@gsd/pi-coding-agent";
import { Text } from "@gsd/pi-tui";
import { Type } from "@sinclair/typebox";
import {
	closeAllMcpConnections,
	discoverMcpServerTools,
	formatMcpSourcePath,
	formatMcpTarget,
	getCachedMcpTools,
	getOrConnectMcpServer,
	invalidateMcpState,
	isMcpServerConnected,
	listConfiguredMcpServers,
	type McpServerConfig,
	type McpToolSchema,
} from "./shared.js";

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatServerList(servers: McpServerConfig[]): string {
	if (servers.length === 0) return "No MCP servers configured. Add servers to .mcp.json or .gsd/mcp.json.";

	const rows = servers.map((server) => ({
		connected: isMcpServerConnected(server.name) ? "✓" : "○",
		name: server.name,
		transport: server.transport,
		source: formatMcpSourcePath(server.sourcePath),
		target: formatMcpTarget(server),
		toolCount: getCachedMcpTools(server.name)?.length,
	}));
	const widths = {
		name: Math.max(...rows.map((row) => row.name.length), 4),
		transport: Math.max(...rows.map((row) => row.transport.length), 4),
		source: Math.max(...rows.map((row) => row.source.length), 6),
		target: Math.max(...rows.map((row) => row.target.length), 6),
	};

	const lines: string[] = [`${rows.length} MCP servers configured:\n`];
	for (const row of rows) {
		const toolCount = row.toolCount == null ? "" : `  ${row.toolCount} tool${row.toolCount === 1 ? "" : "s"}`;
		lines.push(
			`${row.connected} ${row.name.padEnd(widths.name)}  ${row.transport.padEnd(widths.transport)}  ${row.source.padEnd(widths.source)}  ${row.target.padEnd(widths.target)}${toolCount}`,
		);
	}

	lines.push("\nUse mcp_discover to see full tool schemas for a specific server.");
	lines.push("Use mcp_call to invoke a tool: mcp_call(server, tool, args).");
	return lines.join("\n");
}

function formatToolList(serverName: string, tools: McpToolSchema[]): string {
	const lines: string[] = [`${serverName} — ${tools.length} tools:\n`];

	for (const tool of tools) {
		lines.push(`## ${tool.name}`);
		if (tool.description) lines.push(tool.description);
		if (tool.inputSchema) {
			lines.push("```json");
			lines.push(JSON.stringify(tool.inputSchema, null, 2));
			lines.push("```");
		}
		lines.push("");
	}

	lines.push(`Call with: mcp_call(server="${serverName}", tool="<tool_name>", args={...})`);
	return lines.join("\n");
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// ── mcp_servers ──────────────────────────────────────────────────────────

	pi.registerTool({
		name: "mcp_servers",
		label: "MCP Servers",
		description:
			"List all available MCP servers configured in project files (.mcp.json, .gsd/mcp.json). " +
			"Shows server names, transport type, and connection status. Use mcp_discover to get full tool schemas for a server.",
		promptSnippet:
			"List available MCP servers from project configuration",
		promptGuidelines: [
			"Call mcp_servers to see what MCP servers are available before trying to use one.",
			"MCP servers provide external integrations (Twitter, Linear, Railway, etc.) via the Model Context Protocol.",
			"After listing, use mcp_discover(server) to get tool schemas, then mcp_call(server, tool, args) to invoke.",
		],
		parameters: Type.Object({
			refresh: Type.Optional(
				Type.Boolean({ description: "Force refresh the server list (default: use cache)" }),
			),
		}),

		async execute(_id, params) {
			if (params.refresh) {
				await invalidateMcpState({ closeConnections: false });
			}

			const servers = listConfiguredMcpServers({ refresh: params.refresh });
			return {
				content: [{ type: "text", text: formatServerList(servers) }],
				details: {
					serverCount: servers.length,
					cached: !params.refresh,
				},
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("mcp_servers"));
			if (args.refresh) text += theme.fg("warning", " (refresh)");
			return new Text(text, 0, 0);
		},

		renderResult(result, { isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Reading MCP config..."), 0, 0);
			const details = result.details as { serverCount: number } | undefined;
			return new Text(
				theme.fg("success", `${details?.serverCount ?? 0} servers configured`),
				0,
			);
		},
	});

	// ── mcp_discover ─────────────────────────────────────────────────────────

	pi.registerTool({
		name: "mcp_discover",
		label: "MCP Discover",
		description:
			"Get detailed tool signatures and JSON schemas for a specific MCP server. " +
			"Connects to the server on first call (lazy connection). " +
			"Use this to understand what tools a server provides and what arguments they accept " +
			"before calling them with mcp_call.",
		promptSnippet:
			"Get tool schemas for a specific MCP server before calling its tools",
		promptGuidelines: [
			"Call mcp_discover with a server name to see the full tool signatures before calling mcp_call.",
			"The schemas show required and optional parameters with types and descriptions.",
		],
		parameters: Type.Object({
			server: Type.String({
				description:
					"MCP server name (from mcp_servers output), e.g. 'railway', 'twitter-mcp', 'linear'",
			}),
		}),

		async execute(_id, params, signal) {
			try {
				const { tools, cached } = await discoverMcpServerTools(params.server, { signal, useCache: true });
				const text = formatToolList(params.server, tools);
				const truncation = truncateHead(text, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
				let finalText = truncation.content;
				if (truncation.truncated) {
					finalText += `\n\n[Truncated: ${truncation.outputLines}/${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
				}
				return {
					content: [{ type: "text", text: finalText }],
					details: { server: params.server, toolCount: tools.length, cached },
				};
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				throw new Error(`Failed to discover tools for "${params.server}": ${msg}`);
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("mcp_discover "));
			text += theme.fg("accent", args.server);
			return new Text(text, 0, 0);
		},

		renderResult(result, { isPartial }, theme) {
			if (isPartial) {
				return new Text(theme.fg("warning", "Discovering tools..."), 0, 0);
			}
			const details = result.details as { server: string; toolCount: number } | undefined;
			return new Text(
				theme.fg("success", `${details?.toolCount ?? 0} tools`) +
					theme.fg("dim", ` · ${details?.server}`),
				0,
			);
		},
	});

	// ── mcp_call ─────────────────────────────────────────────────────────────

	pi.registerTool({
		name: "mcp_call",
		label: "MCP Call",
		description:
			"Call a tool on an MCP server. Provide the server name, tool name, and arguments. " +
			"Connects to the server on first call (lazy connection). " +
			"Use mcp_discover first to see available tools and their required arguments.",
		promptSnippet: "Call a tool on an MCP server",
		promptGuidelines: [
			"Always use mcp_discover first to understand the tool's parameters before calling mcp_call.",
			"Arguments are passed as a JSON object matching the tool's input schema.",
		],
		parameters: Type.Object({
			server: Type.String({
				description: "MCP server name, e.g. 'railway', 'twitter-mcp'",
			}),
			tool: Type.String({
				description: "Tool name on that server, e.g. 'railway_list_projects'",
			}),
			args: Type.Optional(
				Type.Object({}, {
					additionalProperties: true,
					description:
						"Tool arguments as key-value pairs matching the tool's input schema",
				}),
			),
		}),

		async execute(_id, params, signal) {
			try {
				const client = await getOrConnectMcpServer(params.server, signal);
				const result = await client.callTool(
					{ name: params.tool, arguments: params.args ?? {} },
					undefined,
					{ signal, timeout: 60_000 },
				);

				const contentItems = result.content as Array<{ type: string; text?: string }>;
				const raw = contentItems
					.map((content) => (content.type === "text" ? content.text ?? "" : JSON.stringify(content)))
					.join("\n");

				const truncation = truncateHead(raw, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
				let finalText = truncation.content;
				if (truncation.truncated) {
					finalText += `\n\n[Output truncated: ${truncation.outputLines}/${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
				}

				return {
					content: [{ type: "text", text: finalText }],
					details: {
						server: params.server,
						tool: params.tool,
						charCount: finalText.length,
						truncated: truncation.truncated,
					},
				};
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				throw new Error(`MCP call failed: ${params.server}.${params.tool}\n${msg}`);
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("mcp_call "));
			text += theme.fg("accent", `${args.server}.${args.tool}`);
			if (args.args && Object.keys(args.args).length > 0) {
				const preview = Object.entries(args.args)
					.slice(0, 3)
					.map(([key, value]) => {
						const stringValue = typeof value === "string" ? value : JSON.stringify(value);
						return `${key}:${stringValue.length > 30 ? stringValue.slice(0, 30) + "…" : stringValue}`;
					})
					.join(" ");
				text += " " + theme.fg("muted", preview);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { isPartial, expanded }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Calling MCP tool..."), 0, 0);

			const details = result.details as {
				server: string;
				tool: string;
				charCount: number;
				truncated: boolean;
			} | undefined;

			let text = theme.fg("success", `✓ ${details?.server}.${details?.tool}`);
			text += theme.fg("dim", ` · ${(details?.charCount ?? 0).toLocaleString()} chars`);
			if (details?.truncated) text += theme.fg("warning", " · truncated");

			if (expanded) {
				const content = result.content[0];
				if (content?.type === "text") {
					const preview = content.text.split("\n").slice(0, 15).join("\n");
					text += "\n\n" + theme.fg("dim", preview);
				}
			}

			return new Text(text, 0, 0);
		},
	});

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		const servers = listConfiguredMcpServers();
		if (servers.length > 0) {
			ctx.ui.notify(`MCP client ready — ${servers.length} server(s) configured`, "info");
		}
	});

	pi.on("session_shutdown", async () => {
		await closeAllMcpConnections();
	});

	pi.on("session_switch", async () => {
		await invalidateMcpState({ closeConnections: true });
	});
}
