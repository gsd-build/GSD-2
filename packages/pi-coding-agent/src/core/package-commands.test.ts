import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { describe, it } from "node:test";
import { runPackageCommand } from "./package-commands.js";

function createCaptureStream() {
	let output = "";
	const stream = new Writable({
		write(chunk, _encoding, callback) {
			output += chunk.toString();
			callback();
		},
	}) as unknown as NodeJS.WriteStream;
	return { stream, getOutput: () => output };
}

function writePackage(root: string, files: Record<string, string>): void {
	for (const [relPath, content] of Object.entries(files)) {
		const abs = join(root, relPath);
		mkdirSync(join(abs, ".."), { recursive: true });
		writeFileSync(abs, content, "utf-8");
	}
}

describe("runPackageCommand install post-install hooks", () => {
	it("executes registerPostInstall handlers for local packages", async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-post-install-"));
		const cwd = join(root, "cwd");
		const agentDir = join(root, "agent");
		const extensionDir = join(root, "ext-registered");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(extensionDir, { recursive: true });

		try {
			writePackage(extensionDir, {
				"package.json": JSON.stringify({
					name: "ext-registered",
					type: "module",
					pi: { extensions: ["./index.js"] },
				}),
				"index.js": `
					import { writeFileSync } from "node:fs";
					import { join } from "node:path";
					export default function (pi) {
						pi.registerPostInstall((ctx) => {
							writeFileSync(join(ctx.installedPath, "post-install-ran.txt"), "ok", "utf-8");
						});
					}
				`,
			});

			const stdout = createCaptureStream();
			const stderr = createCaptureStream();
			const result = await runPackageCommand({
				appName: "pi",
				args: ["install", extensionDir],
				cwd,
				agentDir,
				stdout: stdout.stream,
				stderr: stderr.stream,
			});

			assert.equal(result.handled, true);
			assert.equal(result.exitCode, 0);
			assert.equal(readFileSync(join(extensionDir, "post-install-ran.txt"), "utf-8"), "ok");
			assert.ok(stdout.getOutput().includes(`Installed ${extensionDir}`));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("runs legacy named postInstall export when no registered hooks exist", async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-post-install-legacy-"));
		const cwd = join(root, "cwd");
		const agentDir = join(root, "agent");
		const extensionDir = join(root, "ext-legacy");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(extensionDir, { recursive: true });

		try {
			writePackage(extensionDir, {
				"package.json": JSON.stringify({
					name: "ext-legacy",
					type: "module",
					pi: { extensions: ["./index.js"] },
				}),
				"index.js": `
					import { writeFileSync } from "node:fs";
					import { join } from "node:path";
					export default function () {}
					export async function postInstall(ctx) {
						writeFileSync(join(ctx.installedPath, "legacy-post-install-ran.txt"), "ok", "utf-8");
					}
				`,
			});

			const stdout = createCaptureStream();
			const stderr = createCaptureStream();
			const result = await runPackageCommand({
				appName: "pi",
				args: ["install", extensionDir],
				cwd,
				agentDir,
				stdout: stdout.stream,
				stderr: stderr.stream,
			});

			assert.equal(result.handled, true);
			assert.equal(result.exitCode, 0);
			assert.equal(readFileSync(join(extensionDir, "legacy-post-install-ran.txt"), "utf-8"), "ok");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("fails install when manifest runtime dependency is missing", async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-post-install-deps-"));
		const cwd = join(root, "cwd");
		const agentDir = join(root, "agent");
		const extensionDir = join(root, "ext-runtime-deps");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(extensionDir, { recursive: true });

		try {
			writePackage(extensionDir, {
				"package.json": JSON.stringify({
					name: "ext-runtime-deps",
					type: "module",
					pi: { extensions: ["./index.js"] },
				}),
				"index.js": `export default function () {}`,
				"extension-manifest.json": JSON.stringify({
					id: "ext-runtime-deps",
					name: "Runtime Dep Test",
					version: "1.0.0",
					dependencies: { runtime: ["__definitely_missing_command_for_test__"] },
				}),
			});

			const stdout = createCaptureStream();
			const stderr = createCaptureStream();
			const result = await runPackageCommand({
				appName: "pi",
				args: ["install", extensionDir],
				cwd,
				agentDir,
				stdout: stdout.stream,
				stderr: stderr.stream,
			});

			assert.equal(result.handled, true);
			assert.equal(result.exitCode, 1);
			assert.ok(stderr.getOutput().includes("Missing runtime dependencies"));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
