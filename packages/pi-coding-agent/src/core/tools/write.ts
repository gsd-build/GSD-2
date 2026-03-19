import type { AgentTool } from "@gsd/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import { mkdir as fsMkdir, writeFile as fsWriteFile } from "fs/promises";
import { dirname } from "path";
import { notifyFileChanged } from "../lsp/client.js";
import { withAbortSignal } from "./abort-utils.js";
import { resolveToCwd } from "./path-utils.js";

const writeSchema = Type.Object({
	path: Type.String({ description: "Path to the file to write (relative or absolute)" }),
	content: Type.String({ description: "Content to write to the file" }),
});

export type WriteToolInput = Static<typeof writeSchema>;

/**
 * Pluggable operations for the write tool.
 * Override these to delegate file writing to remote systems (e.g., SSH).
 */
export interface WriteOperations {
	/** Write content to a file */
	writeFile: (absolutePath: string, content: string) => Promise<void>;
	/** Create directory (recursively) */
	mkdir: (dir: string) => Promise<void>;
}

const defaultWriteOperations: WriteOperations = {
	writeFile: (path, content) => fsWriteFile(path, content, "utf-8"),
	mkdir: (dir) => fsMkdir(dir, { recursive: true }).then(() => {}),
};

export interface WriteToolOptions {
	/** Custom operations for file writing. Default: local filesystem */
	operations?: WriteOperations;
}

export function createWriteTool(cwd: string, options?: WriteToolOptions): AgentTool<typeof writeSchema> {
	const ops = options?.operations ?? defaultWriteOperations;

	return {
		name: "write",
		label: "write",
		description:
			"Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.",
		parameters: writeSchema,
		execute: async (
			_toolCallId: string,
			{ path, content }: { path: string; content: string },
			signal?: AbortSignal,
		) => {
			const absolutePath = resolveToCwd(path, cwd);
			const dir = dirname(absolutePath);

			return withAbortSignal(signal, async (checkAborted) => {
				// Create parent directories if needed
				await ops.mkdir(dir);

				checkAborted();

				// Write the file
				await ops.writeFile(absolutePath, content);

				try { notifyFileChanged(absolutePath); } catch { /* best-effort */ }

				checkAborted();

				return {
					content: [{ type: "text", text: `Successfully wrote ${content.length} bytes to ${path}` }],
					details: undefined,
				};
			});
		},
	};
}

/** Default write tool using process.cwd() - for backwards compatibility */
export const writeTool = createWriteTool(process.cwd());
