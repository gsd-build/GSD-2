// GSD2 — Codex CLI binary detection for onboarding
// Lightweight check used at onboarding time (before extensions load).
// The full readiness check with caching lives in the codex-cli extension.

import { execFileSync } from "node:child_process";

/**
 * Check if the `codex` binary is installed (regardless of auth state).
 */
export function isCodexBinaryInstalled(): boolean {
	try {
		execFileSync("codex", ["--version"], { timeout: 5_000, stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if the `codex` CLI is installed AND authenticated.
 */
export function isCodexCliReady(): boolean {
	try {
		execFileSync("codex", ["--version"], { timeout: 5_000, stdio: "pipe" });
	} catch {
		return false;
	}

	try {
		const output = execFileSync("codex", ["login", "status"], { timeout: 5_000, stdio: "pipe" })
			.toString()
			.toLowerCase();
		return !(/not logged in|logged out|unauthenticated|not authenticated/i.test(output));
	} catch {
		return false;
	}
}
