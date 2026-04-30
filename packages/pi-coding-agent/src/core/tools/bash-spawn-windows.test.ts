/**
 * bash-spawn-windows.test.ts — Regression test for Windows spawn EINVAL.
 *
 * Verifies that bash tool spawn options disable `detached: true` on Windows
 * to prevent EINVAL errors in ConPTY / VSCode terminal contexts.
 *
 * Background:
 *   On Windows, `spawn()` with `detached: true` sets the
 *   CREATE_NEW_PROCESS_GROUP flag in CreateProcess.  In certain terminal
 *   contexts (VSCode integrated terminal, ConPTY, Windows Terminal) this
 *   flag conflicts with the parent process group and causes a synchronous
 *   EINVAL from libuv.  The bg-shell extension already guards against this
 *   with `detached: process.platform !== "win32"` (process-manager.ts);
 *   this test ensures all other spawn sites are aligned.
 *
 * See: gsd-build/gsd-2#XXXX
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

// Verify the spawn option pattern used across the codebase.
// This is a static/structural test — it reads the source files and asserts
// they use the platform-guarded detached flag.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function findRepoRoot(): string {
	const requiredFiles = [
		"packages/pi-coding-agent/src/core/tools/bash.ts",
		"packages/pi-coding-agent/src/core/bash-executor.ts",
		"packages/pi-coding-agent/src/utils/shell.ts",
	];
	const candidates = [
		resolve(__dirname, "../../../../../"),
		resolve(__dirname, "../../../../../../"),
	];
	for (const candidate of candidates) {
		if (requiredFiles.every((file) => existsSync(join(candidate, file)))) {
			return candidate;
		}
	}
	throw new Error(`Unable to resolve repository root from ${__dirname}`);
}

const REPO_ROOT = findRepoRoot();

const SPAWN_FILES = [
	join(REPO_ROOT, "packages/pi-coding-agent/src/core/tools/bash.ts"),
	join(REPO_ROOT, "packages/pi-coding-agent/src/core/bash-executor.ts"),
	join(REPO_ROOT, "packages/pi-coding-agent/src/utils/shell.ts"),
];

test("spawn calls use platform-guarded detached flag (no unconditional detached: true)", () => {
	for (const file of SPAWN_FILES) {
		const content = readFileSync(file, "utf-8");
		const lines = content.split("\n");

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!;
			// Skip comments
			if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
			// Check for unconditional `detached: true`
			if (/detached:\s*true\b/.test(line)) {
				assert.fail(
					`${file}:${i + 1} has unconditional 'detached: true' — ` +
					`must use 'detached: process.platform !== "win32"' ` +
					`to prevent EINVAL on Windows (ConPTY / VSCode terminal)`,
				);
			}
		}
	}
});

test("killProcessTree does not use detached: true for taskkill on Windows", () => {
	const shellFile = join(REPO_ROOT, "packages/pi-coding-agent/src/utils/shell.ts");
	const content = readFileSync(shellFile, "utf-8");

	// Find the taskkill spawn call and ensure it doesn't have detached: true
	const taskkillRegion = content.match(/spawn\("taskkill"[\s\S]*?\}\)/);
	if (taskkillRegion) {
		assert.ok(
			!/detached:\s*true/.test(taskkillRegion[0]),
			"taskkill spawn should not use detached: true — " +
			"it can cause EINVAL on Windows and is unnecessary for a utility process",
		);
	}
});

// Smoke test: spawn with platform-guarded detached flag actually works
test("spawn with detached: process.platform !== 'win32' succeeds", async () => {
	const { promise, resolve, reject } = Promise.withResolvers<void>();

	const child = spawn(
		process.platform === "win32" ? "cmd" : "sh",
		process.platform === "win32" ? ["/c", "echo ok"] : ["-c", "echo ok"],
		{
			detached: process.platform !== "win32",
			stdio: ["ignore", "pipe", "pipe"],
		},
	);

	let output = "";
	child.stdout?.on("data", (d: Buffer) => { output += d.toString(); });
	child.on("error", reject);
	child.on("close", (code) => {
		try {
			assert.equal(code, 0, "spawn should succeed");
			assert.ok(output.trim().includes("ok"), `Expected 'ok' in output, got: ${output}`);
			resolve();
		} catch (e) {
			reject(e);
		}
	});

	await promise;
});
