/**
 * shell-bat-wrapper.test.ts — Regression test for Windows .bat/.cmd shellPath EINVAL.
 *
 * When shellPath in settings.json points to a .bat or .cmd file (e.g., a WSL
 * bash wrapper), Node's spawn() cannot execute it directly — .bat files are
 * not PE executables and require cmd.exe to interpret them. Without `shell: true`,
 * spawn() returns EINVAL.
 *
 * This test verifies that:
 * 1. getShellConfig() sets `needsShell: true` for .bat/.cmd paths
 * 2. All spawn call sites pass `shell: true` when `needsShell` is set
 *
 * See: gsd-build/gsd-2#3659
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Unit tests for isBatchFile detection ────────────────────────────────────

test("getShellConfig return type includes needsShell property", () => {
	const shellFile = join(__dirname, "shell.ts");
	const content = readFileSync(shellFile, "utf-8");

	// Verify the return type includes needsShell
	assert.ok(
		content.includes("needsShell: boolean"),
		"getShellConfig return type must include needsShell: boolean",
	);

	// Verify isBatchFile helper exists
	assert.ok(
		content.includes("function isBatchFile"),
		"isBatchFile helper function must exist in shell.ts",
	);
});

test("isBatchFile detects .bat and .cmd extensions", () => {
	const shellFile = join(__dirname, "shell.ts");
	const content = readFileSync(shellFile, "utf-8");

	// Verify the regex covers both .bat and .cmd (case-insensitive)
	assert.ok(
		/\.(bat|cmd)\$/.test(content) || /bat\|cmd/.test(content),
		"isBatchFile must detect both .bat and .cmd extensions",
	);

	assert.ok(
		content.includes("/i"),
		"isBatchFile regex should be case-insensitive",
	);
});

test("all cached config paths include needsShell", () => {
	const shellFile = join(__dirname, "shell.ts");
	const content = readFileSync(shellFile, "utf-8");

	// Find all lines that set cachedShellConfig
	const lines = content.split("\n");
	const cacheAssignments = lines.filter(
		(line) => line.includes("cachedShellConfig = {") && line.includes("shell:"),
	);

	assert.ok(cacheAssignments.length > 0, "Expected at least one cachedShellConfig assignment");

	for (const line of cacheAssignments) {
		assert.ok(
			line.includes("needsShell"),
			`cachedShellConfig assignment missing needsShell: ${line.trim()}`,
		);
	}
});

// ── Structural tests: spawn sites pass shell: true when needsShell ──────────

const SPAWN_SITES = [
	{
		label: "bash-executor.ts",
		path: join(__dirname, "..", "core", "bash-executor.ts"),
	},
	{
		label: "bg-shell/process-manager.ts",
		path: join(__dirname, "..", "..", "..", "src", "resources", "extensions", "bg-shell", "process-manager.ts"),
	},
	{
		label: "async-jobs/async-bash-tool.ts",
		path: join(__dirname, "..", "..", "..", "src", "resources", "extensions", "async-jobs", "async-bash-tool.ts"),
	},
];

test("all spawn sites that use getShellConfig destructure needsShell", () => {
	for (const { label, path: filePath } of SPAWN_SITES) {
		let content: string;
		try {
			content = readFileSync(filePath, "utf-8");
		} catch {
			// File may not exist in this checkout — skip
			continue;
		}

		// Must destructure needsShell from getShellConfig
		assert.ok(
			content.includes("needsShell") && content.includes("getShellConfig"),
			`${label}: must destructure needsShell from getShellConfig()`,
		);
	}
});

test("all spawn sites conditionally pass shell: true when needsShell", () => {
	for (const { label, path: filePath } of SPAWN_SITES) {
		let content: string;
		try {
			content = readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		// Must have the shell: true conditional spread
		assert.ok(
			content.includes("needsShell") && content.includes("shell: true"),
			`${label}: must conditionally pass shell: true when needsShell is set`,
		);
	}
});
