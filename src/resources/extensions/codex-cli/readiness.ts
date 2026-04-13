/**
 * Readiness check for the Codex CLI provider.
 *
 * Verifies the `codex` binary is installed, responsive, AND authenticated.
 * Results are cached for 30 seconds to avoid shelling out on every
 * model-availability check.
 */

import { execFileSync } from "node:child_process";

type CodexCommandRunner = (args: string[]) => Buffer;

let commandRunnerForTests: CodexCommandRunner | null = null;
let cachedBinaryPresent: boolean | null = null;
let cachedAuthed: boolean | null = null;
let lastCheckMs = 0;
const CHECK_INTERVAL_MS = 30_000;

function runCodex(args: string[]): Buffer {
	if (commandRunnerForTests) {
		return commandRunnerForTests(args);
	}
	return execFileSync("codex", args, { timeout: 5_000, stdio: "pipe" });
}

function refreshCache(): void {
	const now = Date.now();
	if (cachedBinaryPresent !== null && now - lastCheckMs < CHECK_INTERVAL_MS) {
		return;
	}

	lastCheckMs = now;

	try {
		runCodex(["--version"]);
		cachedBinaryPresent = true;
	} catch {
		cachedBinaryPresent = false;
		cachedAuthed = false;
		return;
	}

	try {
		const output = runCodex(["login", "status"]).toString().toLowerCase();
		cachedAuthed = !(/not logged in|logged out|unauthenticated|not authenticated/i.test(output));
	} catch {
		cachedAuthed = false;
	}
}

export function isCodexBinaryPresent(): boolean {
	refreshCache();
	return cachedBinaryPresent ?? false;
}

export function isCodexCliAuthed(): boolean {
	refreshCache();
	return (cachedBinaryPresent ?? false) && (cachedAuthed ?? false);
}

export function isCodexCliReady(): boolean {
	refreshCache();
	return (cachedBinaryPresent ?? false) && (cachedAuthed ?? false);
}

export function clearReadinessCache(): void {
	cachedBinaryPresent = null;
	cachedAuthed = null;
	lastCheckMs = 0;
}

export function setCodexCommandRunnerForTests(runner?: CodexCommandRunner): void {
	commandRunnerForTests = runner ?? null;
	clearReadinessCache();
}
