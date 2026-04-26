/**
 * Readiness check for the Claude Code CLI provider.
 *
 * Verifies the `claude` binary is installed, responsive, AND authenticated.
 * Results are cached for 30 seconds to avoid shelling out on every
 * model-availability check.
 *
 * Auth verification runs `claude auth status --json` and inspects the
 * `loggedIn` field, falling back to plain `claude auth status` and a text
 * heuristic when the JSON shape is unavailable (older Claude CLI builds).
 *
 * Set GSD_CLAUDE_DEBUG=1 to print the probe's binary selection and auth
 * outputs to stderr — useful when diagnosing platform-specific detection
 * failures (Issue #4997).
 */

import { execFileSync } from "node:child_process";

/**
 * Candidate executable names for the Claude Code CLI.
 *
 * Keep the explicit win32 ternary selector for regression coverage (Issue #4424):
 * Node's execFileSync must target `claude.cmd` directly on Windows.
 */
const CLAUDE_COMMAND = process.platform === "win32" ? "claude.cmd" : "claude";

/**
 * Windows installs vary: some environments expose `claude.cmd` (npm shim),
 * `claude.exe` (direct binary install), or a bare `claude` shim on PATH
 * (for example Git Bash wrappers). Try all three to avoid false "not
 * installed" results in readiness checks.
 */
const CLAUDE_COMMAND_CANDIDATES = process.platform === "win32" ? [CLAUDE_COMMAND, "claude.exe", "claude"] : [CLAUDE_COMMAND];

// Keep the version probe snappy — `claude --version` is a quick path.
const VERSION_TIMEOUT_MS = 5_000;
// Auth status can be much slower on Windows because the spawn goes through
// cmd.exe → claude.cmd → node → Claude CLI. 15s leaves headroom on cold spawns
// without making startup feel hung when the CLI is genuinely missing.
const AUTH_TIMEOUT_MS = 15_000;

function debugLog(...parts: unknown[]): void {
	if (process.env.GSD_CLAUDE_DEBUG) {
		process.stderr.write(`[claude-readiness] ${parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")}\n`);
	}
}

/**
 * Find the first candidate that responds to `--version`. Returns the
 * candidate name on success, null if none worked.
 *
 * On Windows with `shell: true`, a missing candidate surfaces as a
 * non-zero exit from cmd.exe rather than ENOENT — so we cannot rely on
 * the error code to decide "try next". Treat any failure as "try next"
 * for the version probe; the only thing that matters for binary
 * detection is whether *some* candidate produces a `claude --version`
 * line.
 */
function findWorkingCommand(): string | null {
	for (const command of CLAUDE_COMMAND_CANDIDATES) {
		try {
			execFileSync(command, ["--version"], {
				timeout: VERSION_TIMEOUT_MS,
				stdio: "pipe",
				shell: process.platform === "win32",
			});
			debugLog("version probe ok via", command);
			return command;
		} catch (error) {
			debugLog("version probe failed for", command, "code=", (error as NodeJS.ErrnoException | undefined)?.code);
			continue;
		}
	}
	return null;
}

/**
 * Decide auth state from `claude auth status` output.
 *
 * Newer Claude CLI builds emit JSON by default with a `loggedIn` boolean.
 * Older builds emit free-form text. We prefer the structured signal and fall
 * back to a text heuristic. Note: the text heuristic only covers English
 * phrasing — the JSON path is the durable signal.
 */
function parseAuthStatus(output: string): boolean | null {
	const trimmed = output.trim();
	if (!trimmed) return null;

	if (trimmed.startsWith("{")) {
		try {
			const parsed = JSON.parse(trimmed) as { loggedIn?: unknown };
			if (typeof parsed.loggedIn === "boolean") {
				return parsed.loggedIn;
			}
		} catch {
			// Fall through to text heuristic.
		}
	}

	const lower = trimmed.toLowerCase();
	if (/not logged in|no credentials|unauthenticated|not authenticated/.test(lower)) {
		return false;
	}
	if (/logged in|authenticated|signed in|email|subscription/.test(lower)) {
		return true;
	}
	return null;
}

function probeAuth(command: string): boolean | null {
	// Try --json first (newer CLIs).
	try {
		const out = execFileSync(command, ["auth", "status", "--json"], {
			timeout: AUTH_TIMEOUT_MS,
			stdio: "pipe",
			shell: process.platform === "win32",
		}).toString();
		debugLog("auth status --json output:", out.slice(0, 200));
		const parsed = parseAuthStatus(out);
		if (parsed !== null) return parsed;
	} catch (error) {
		debugLog("auth status --json threw:", (error as Error).message?.slice(0, 200));
	}

	// Fallback: plain `auth status` (older CLIs that don't accept --json).
	try {
		const out = execFileSync(command, ["auth", "status"], {
			timeout: AUTH_TIMEOUT_MS,
			stdio: "pipe",
			shell: process.platform === "win32",
		}).toString();
		debugLog("auth status output:", out.slice(0, 200));
		return parseAuthStatus(out);
	} catch (error) {
		debugLog("auth status threw:", (error as Error).message?.slice(0, 200));
		return null;
	}
}

let cachedBinaryPresent: boolean | null = null;
let cachedAuthed: boolean | null = null;
let lastCheckMs = 0;
const CHECK_INTERVAL_MS = 30_000;

/**
 * Refresh the cached binary/auth state when the cache window has expired.
 * Preserves a known auth state across soft-fail auth probes.
 */
function refreshCache(): void {
	const now = Date.now();
	if (cachedBinaryPresent !== null && now - lastCheckMs < CHECK_INTERVAL_MS) {
		return;
	}

	// Set timestamp first to prevent re-entrant checks during the same window
	lastCheckMs = now;

	const command = findWorkingCommand();
	if (!command) {
		cachedBinaryPresent = false;
		cachedAuthed = false;
		return;
	}
	cachedBinaryPresent = true;

	const authed = probeAuth(command);
	if (authed === null) {
		// Couldn't determine auth state from CLI output. Don't clobber a
		// previously known-good cache; otherwise default to false so we don't
		// silently route requests to an unauthenticated CLI.
		if (cachedAuthed === null) cachedAuthed = false;
		return;
	}
	cachedAuthed = authed;
}

/**
 * Whether the `claude` binary is installed (regardless of auth state).
 */
export function isClaudeBinaryPresent(): boolean {
	refreshCache();
	return cachedBinaryPresent ?? false;
}

/**
 * Whether the `claude` CLI is authenticated with a valid session.
 * Returns false if the binary is not installed.
 */
export function isClaudeCodeAuthed(): boolean {
	refreshCache();
	return (cachedBinaryPresent ?? false) && (cachedAuthed ?? false);
}

/**
 * Full readiness check: binary installed AND authenticated.
 * This is the gating function used by the provider registration.
 */
export function isClaudeCodeReady(): boolean {
	refreshCache();
	return (cachedBinaryPresent ?? false) && (cachedAuthed ?? false);
}

/**
 * Force-clear the cached readiness state.
 * Useful after the user completes auth setup so the next check is fresh.
 */
export function clearReadinessCache(): void {
	cachedBinaryPresent = null;
	cachedAuthed = null;
	lastCheckMs = 0;
}
