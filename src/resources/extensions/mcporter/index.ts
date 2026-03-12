/**
 * MCPorter Extension — Lazy MCP server integration for pi
 *
 * Provides on-demand access to all MCP servers configured on the system
 * (via Claude Desktop, Cursor, VS Code, mcporter config, etc.) without
 * registering every tool upfront. This keeps token usage near-zero until
 * the agent actually needs an MCP tool.
 *
 * Three tools:
 *   mcp_servers   — List available MCP servers (cached after first call)
 *   mcp_discover  — Get tool signatures for a specific server
 *   mcp_call      — Call a tool on an MCP server
 *
 * Requirements:
 *   - mcporter installed globally: npm i -g mcporter
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	truncateHead,
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { execFile, exec } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

// ─── Types ────────────────────────────────────────────────────────────────────

interface McpServer {
	name: string;
	status: string;
	transport?: string;
	tools: { name: string; description: string }[];
}

interface McpListResponse {
	mode: string;
	counts: { ok: number; auth: number; offline: number; http: number; error: number };
	servers: McpServer[];
}

interface McpToolSchema {
	name: string;
	description: string;
	inputSchema?: Record<string, unknown>;
}

interface McpServerDetail {
	name: string;
	status: string;
	tools: McpToolSchema[];
}

// ─── Cache ────────────────────────────────────────────────────────────────────

let serverListCache: McpServer[] | null = null;
const serverDetailCache = new Map<string, McpServerDetail>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function runMcporter(
	args: string[],
	signal?: AbortSignal,
	timeoutMs = 30000,
): Promise<string> {
	// Cross-platform: use execFile on Windows to avoid quote handling issues
	// On Windows, cmd.exe doesn't strip single quotes like Unix shells do
	if (process.platform === "win32") {
		// Use execFile directly - Windows doesn't need shell for PATH resolution here
		const { stdout } = await execFileAsync("mcporter", args, {
			timeout: timeoutMs,
			maxBuffer: 1024 * 1024,
			signal,
			env: { ...process.env },
			shell: true, // Enable shell for PATH resolution on Windows
		});
		return stdout;
	}
	// Use shell exec so PATH resolution works on Unix
	const escaped = args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
	const { stdout } = await execAsync(`mcporter ${escaped}`, {
		timeout: timeoutMs,
		maxBuffer: 1024 * 1024,
		signal,
		env: { ...process.env },
	});
	return stdout;
}

async function getServerList(signal?: AbortSignal): Promise<McpServer[]> {
	if (serverListCache) return serverListCache;

	const raw = await runMcporter(["list", "--json"], signal, 60000);
	let data: McpListResponse;
	try {
		data = JSON.parse(raw) as McpListResponse;
	} catch (e) {
		throw new Error(`Failed to parse mcporter output: ${raw.slice(0, 300)}`);
	}
	if (!Array.isArray(data.servers)) {
		throw new Error(`Unexpected mcporter response shape: ${JSON.stringify(Object.keys(data))}`);
	}
	serverListCache = data.servers;
	return serverListCache;
}

async function getServerDetail(
	serverName: string,
	signal?: AbortSignal,
): Promise<McpServerDetail> {
	if (serverDetailCache.has(serverName)) return serverDetailCache.get(serverName)!;

	const raw = await runMcporter(["list", serverName, "--schema", "--json"], signal);
	const data = JSON.parse(raw) as McpServerDetail;
	serverDetailCache.set(serverName, data);
	return data;
}

function formatServerList(servers: McpServer[]): string {
	if (servers.length === 0) return "No MCP servers found.";

	const lines: string[] = [`${servers.length} MCP servers available:\n`];

	for (const s of servers) {
		const tools = s.tools ?? [];
		const status = s.status === "ok" ? "✓" : s.status === "auth" ? "🔑" : "✗";
		lines.push(`${status} ${s.name} — ${tools.length} tools (${s.status})`);
		for (const t of tools) {
			lines.push(`    ${t.name}: ${t.description?.slice(0, 100) ?? ""}`);
		}
	}

	lines.push("\nUse mcp_discover to see full tool schemas for a specific server.");
	lines.push("Use mcp_call to invoke a tool: mcp_call(server, tool, args).");
	return lines.join("\n");
}

function formatServerDetail(detail: McpServerDetail): string {
	const lines: string[] = [`${detail.name} — ${detail.tools.length} tools:\n`];

	for (const tool of detail.tools) {
		lines.push(`## ${tool.name}`);
		if (tool.description) lines.push(tool.description);
		if (tool.inputSchema) {
			lines.push("```json");
			lines.push(JSON.stringify(tool.inputSchema, null, 2));
			lines.push("```");
		}
		lines.push("");
	}

	lines.push(`Call with: mcp_call(server="${detail.name}", tool="<tool_name>", args={...})`);
	return lines.join("\n");
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// ── mcp_servers ──────────────────────────────────────────────────────────

	pi.registerTool({
		name: "mcp_servers",
		label: "MCP Servers",
		description:
			"List all available MCP servers discovered from your system (Claude Desktop, Cursor, VS Code, mcporter config). " +
			"Shows server names, status, and tool counts. Use mcp_discover to get full tool schemas for a server.",
		promptSnippet:
			"List available MCP servers and their tools (lazy discovery via mcporter)",
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

		async execute(_id, params, signal) {
			if (params.refresh) serverListCache = null;

			try {
				const servers = await getServerList(signal);
				return {
					content: [{ type: "text", text: formatServerList(servers) }],
					details: {
						serverCount: servers.length,
						cached: !params.refresh && serverListCache !== null,
					},
				};
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				throw new Error(
					`Failed to list MCP servers. Is mcporter installed? (npm i -g mcporter)\n${msg}`,
				);
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("mcp_servers"));
			if (args.refresh) text += theme.fg("warning", " (refresh)");
			return new Text(text, 0, 0);
		},

		renderResult(result, { isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Discovering MCP servers..."), 0, 0);
			const d = result.details as { serverCount: number } | undefined;
			return new Text(
				theme.fg("success", `${d?.serverCount ?? 0} servers found`),
				0,
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
				const detail = await getServerDetail(params.server, signal);
				const text = formatServerDetail(detail);

				// Truncation guard
				const truncation = truncateHead(text, {
					maxLines: DEFAULT_MAX_LINES,
					maxBytes: DEFAULT_MAX_BYTES,
				});
				let finalText = truncation.content;
				if (truncation.truncated) {
					finalText +=
						`\n\n[Truncated: ${truncation.outputLines}/${truncation.totalLines} lines ` +
						`(${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
				}

				return {
					content: [{ type: "text", text: finalText }],
					details: {
						server: params.server,
						toolCount: detail.tools.length,
						cached: serverDetailCache.has(params.server),
					},
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
			if (isPartial)
				return new Text(theme.fg("warning", "Discovering tools..."), 0, 0);
			const d = result.details as { server: string; toolCount: number } | undefined;
			return new Text(
				theme.fg("success", `${d?.toolCount ?? 0} tools`) +
					theme.fg("dim", ` · ${d?.server}`),
				0,
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
			"Use mcp_discover first to see available tools and their required arguments.",
		promptSnippet: "Call a tool on an MCP server via mcporter",
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
				Type.Record(Type.String(), Type.Unknown(), {
					description:
						"Tool arguments as key-value pairs matching the tool's input schema",
				}),
			),
		}),

		async execute(_id, params, signal) {
			// Build mcporter call command: mcporter call server.tool key:value ...
			const callTarget = `${params.server}.${params.tool}`;
			const cliArgs = ["call", callTarget, "--output", "raw"];

			if (params.args && Object.keys(params.args).length > 0) {
				for (const [key, value] of Object.entries(params.args)) {
					const strVal =
						typeof value === "string" ? value : JSON.stringify(value);
					cliArgs.push(`${key}:${strVal}`);
				}
			}

			try {
				const raw = await runMcporter(cliArgs, signal, 60000);

				// Truncation guard
				const truncation = truncateHead(raw, {
					maxLines: DEFAULT_MAX_LINES,
					maxBytes: DEFAULT_MAX_BYTES,
				});
				let finalText = truncation.content;
				if (truncation.truncated) {
					finalText +=
						`\n\n[Output truncated: ${truncation.outputLines}/${truncation.totalLines} lines ` +
						`(${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
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
				throw new Error(
					`MCP call failed: ${params.server}.${params.tool}\n${msg}`,
				);
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("mcp_call "));
			text += theme.fg("accent", `${args.server}.${args.tool}`);
			if (args.args && Object.keys(args.args).length > 0) {
				const preview = Object.entries(args.args)
					.slice(0, 3)
					.map(([k, v]) => {
						const val = typeof v === "string" ? v : JSON.stringify(v);
						return `${k}:${val.length > 30 ? val.slice(0, 30) + "…" : val}`;
					})
					.join(" ");
				text += " " + theme.fg("muted", preview);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { isPartial, expanded }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Calling MCP tool..."), 0, 0);

			const d = result.details as {
				server: string;
				tool: string;
				charCount: number;
				truncated: boolean;
			} | undefined;

			let text = theme.fg("success", `✓ ${d?.server}.${d?.tool}`);
			text += theme.fg("dim", ` · ${(d?.charCount ?? 0).toLocaleString()} chars`);
			if (d?.truncated) text += theme.fg("warning", " · truncated");

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

	// ── Verify mcporter is available ─────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		try {
			const ver = (await runMcporter(["--version"], undefined, 5000)).trim();
		ctx.ui.notify(`MCPorter ${ver} ready`, "info");
		} catch {
			ctx.ui.notify(
				"MCPorter not found. Install with: npm i -g mcporter",
				"error",
			);
		}
	});
}
