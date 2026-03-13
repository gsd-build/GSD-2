/**
 * Python extension — registers a persistent IPython kernel tool.
 *
 * Variables, imports, and loaded data persist across tool calls within a session.
 * Supports rich output (images, markdown, JSON). Gracefully degrades if
 * jupyter_kernel_gateway is not installed.
 */

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "../../../core/extensions/types.js";
import { PythonExecutor } from "./executor.js";
import { shutdownGateway } from "./gateway.js";
import { renderExecuteResult } from "./kernel.js";
import { resolvePythonRuntime, hasKernelGateway } from "./runtime.js";

const pythonSchema = Type.Object({
	cells: Type.Array(
		Type.Object({
			code: Type.String({ description: "Python code to execute" }),
			title: Type.Optional(Type.String({ description: "Optional label for this cell" })),
		}),
		{ description: "Code cells to execute sequentially. State persists across cells and tool calls." },
	),
	timeout: Type.Optional(
		Type.Number({
			description: "Execution timeout per cell in seconds",
			default: 30,
			minimum: 1,
			maximum: 600,
		}),
	),
	cwd: Type.Optional(
		Type.String({
			description: "Working directory for this execution. Defaults to the session cwd.",
		}),
	),
	reset: Type.Optional(
		Type.Boolean({
			description: "If true, restart the kernel before execution (clears all state)",
		}),
	),
});

let executor: PythonExecutor | null = null;

function getExecutor(pythonPath: string): PythonExecutor {
	if (!executor) {
		executor = new PythonExecutor(pythonPath);
	}
	return executor;
}

/**
 * Python extension factory.
 *
 * Checks for Python + kernel_gateway availability at load time.
 * If not available, the tool is not registered (graceful degradation).
 */
export default function pythonExtension(api: ExtensionAPI): void {
	// Resolve Python runtime
	const runtime = resolvePythonRuntime(process.cwd());
	if (!runtime) {
		console.warn("[python] No suitable Python runtime found (need >= 3.8). Python tool not available.");
		return;
	}

	// Check for kernel_gateway
	if (!hasKernelGateway(runtime.pythonPath)) {
		console.warn(
			`[python] jupyter_kernel_gateway not installed for ${runtime.pythonPath}. ` +
				"Install with: pip install jupyter_kernel_gateway ipykernel",
		);
		return;
	}

	const pythonPath = runtime.pythonPath;

	api.registerTool({
		name: "python",
		label: "Python",
		description: [
			"Execute Python code in a persistent IPython kernel. Variables, imports, and loaded data persist across calls.",
			"Use for: data analysis, computation, file processing, API calls, prototyping algorithms.",
			"State persists within a session — define variables in one call, use them in the next.",
			"Supports rich output: images (matplotlib), markdown, JSON.",
		].join(" "),
		promptSnippet:
			"python — Execute Python in a persistent IPython kernel (stateful, rich output, data analysis)",
		promptGuidelines: [
			"Use the python tool for computation, data analysis, or when you need persistent state across multiple steps.",
			"Variables defined in one python call persist to the next — no need to redefine.",
			"For simple file operations, prefer the dedicated read/write/edit tools. Use python for complex processing.",
			"The kernel has prelude helpers: read(), write(), find(), grep(), run(), tree(), diff(), etc.",
		],
		parameters: pythonSchema,

		execute: async (
			_toolCallId: string,
			params: {
				cells: Array<{ code: string; title?: string }>;
				timeout?: number;
				cwd?: string;
				reset?: boolean;
			},
			signal: AbortSignal | undefined,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) => {
			const exec = getExecutor(pythonPath);
			const cwd = params.cwd ?? ctx.cwd;
			const timeoutMs = (params.timeout ?? 30) * 1000;

			// Handle kernel reset
			if (params.reset) {
				await exec.restart(cwd);
			}

			const cellResults: Array<{
				title?: string;
				text: string;
				images: string[];
				error: boolean;
			}> = [];

			// Execute cells sequentially
			for (const cell of params.cells) {
				try {
					const result = await exec.execute(cell.code, {
						cwd,
						timeout: timeoutMs,
						signal,
					});
					const rendered = renderExecuteResult(result);
					cellResults.push({
						title: cell.title,
						text: rendered.text,
						images: rendered.images,
						error: result.error,
					});

					// Stop on error
					if (result.error) break;
				} catch (err) {
					cellResults.push({
						title: cell.title,
						text: err instanceof Error ? err.message : String(err),
						images: [],
						error: true,
					});
					break;
				}
			}

			// Format output
			const textParts: string[] = [];
			const allImages: Array<{ type: "image"; source: { type: "base64"; media_type: string; data: string } }> =
				[];

			for (let i = 0; i < cellResults.length; i++) {
				const cell = cellResults[i]!;

				if (params.cells.length > 1) {
					const header = cell.title ?? `Cell ${i + 1}`;
					textParts.push(`--- ${header} ---`);
				}

				if (cell.text) {
					textParts.push(cell.text);
				} else if (!cell.error) {
					textParts.push("(no output)");
				}

				for (const img of cell.images) {
					allImages.push({
						type: "image",
						source: {
							type: "base64",
							media_type: "image/png",
							data: img,
						},
					});
				}

				if (cell.error) {
					textParts.push("[execution stopped due to error]");
				}
			}

			const text = textParts.join("\n");

			// Build content array
			const content: Array<{ type: string; text?: string; source?: unknown }> = [
				{ type: "text", text: text || "(no output)" },
			];

			// Add images as separate content blocks
			for (const img of allImages) {
				content.push(img as any);
			}

			const hasErrors = cellResults.some((c) => c.error);
			if (hasErrors) {
				throw new Error(text);
			}

			return { content: content as any, details: undefined };
		},
	});

	// Clean up on session shutdown
	api.on("session_shutdown", async () => {
		if (executor) {
			await executor.shutdown();
			executor = null;
		}
		shutdownGateway();
	});
}
