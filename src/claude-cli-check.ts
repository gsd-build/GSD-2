// GSD2 — Claude CLI binary detection for onboarding
// Lightweight check used at onboarding time (before extensions load).
// The full readiness check with caching lives in the claude-code-cli extension.
//
// Set GSD_CLAUDE_DEBUG=1 to log probe output to stderr. Useful when
// diagnosing platform-specific detection failures (Issue #4997).

import { execFileSync } from 'node:child_process'

/**
 * Platform-correct binary name for the Claude Code CLI.
 *
 * On Windows, npm-global binaries are installed as `.cmd` shims and
 * `execFileSync` does not auto-resolve the extension — calling bare
 * `claude` would fail with ENOENT even when the CLI is installed and
 * authenticated. Mirrors the `NPM_COMMAND` pattern in
 * `src/resources/extensions/gsd/pre-execution-checks.ts`.
 */
export const CLAUDE_COMMAND = process.platform === 'win32' ? 'claude.cmd' : 'claude'

/**
 * Ordered list of binary names to probe for the Claude Code CLI.
 *
 * Windows installs vary: npm-global installs produce a `claude.cmd` shim,
 * direct binary installs produce `claude.exe`, and Git Bash wrappers may
 * expose a bare `claude` shim. Try all three so no valid install is missed.
 */
const CLAUDE_COMMAND_CANDIDATES: string[] =
  process.platform === 'win32' ? [CLAUDE_COMMAND, 'claude.exe', 'claude'] : [CLAUDE_COMMAND]

const VERSION_TIMEOUT_MS = 5_000
// Auth probe needs more headroom on Windows because the spawn goes through
// cmd.exe → claude.cmd → node → Claude CLI.
const AUTH_TIMEOUT_MS = 15_000

function debugLog(...parts: unknown[]): void {
  if (process.env.GSD_CLAUDE_DEBUG) {
    process.stderr.write(`[claude-cli-check] ${parts.map(p => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`)
  }
}

/**
 * Find the first candidate that responds to `--version`. Returns the
 * candidate name on success, null if none worked.
 *
 * On Windows with `shell: true`, a missing candidate surfaces as a
 * non-zero exit from cmd.exe rather than ENOENT — so we cannot rely on
 * the error code to decide "try next". Treat any failure as "try next"
 * for the version probe.
 */
function findWorkingCommand(): string | null {
  for (const command of CLAUDE_COMMAND_CANDIDATES) {
    try {
      execFileSync(command, ['--version'], {
        timeout: VERSION_TIMEOUT_MS,
        stdio: 'pipe',
        shell: process.platform === 'win32',
      })
      debugLog('version probe ok via', command)
      return command
    } catch (error) {
      debugLog('version probe failed for', command, 'code=', (error as NodeJS.ErrnoException | undefined)?.code)
      continue
    }
  }
  return null
}

/**
 * Decide auth state from `claude auth status` output.
 *
 * Newer Claude CLI builds emit JSON with a `loggedIn` boolean. Older builds
 * emit free-form text. Prefer the structured signal; fall back to a text
 * heuristic. The text heuristic only covers English phrasing.
 */
function parseAuthStatus(output: string): boolean | null {
  const trimmed = output.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { loggedIn?: unknown }
      if (typeof parsed.loggedIn === 'boolean') {
        return parsed.loggedIn
      }
    } catch {
      // Fall through to text heuristic.
    }
  }

  const lower = trimmed.toLowerCase()
  if (/not logged in|no credentials|unauthenticated|not authenticated/.test(lower)) {
    return false
  }
  if (/logged in|authenticated|signed in|email|subscription/.test(lower)) {
    return true
  }
  return null
}

function probeAuth(command: string): boolean | null {
  // Try --json first (newer CLIs).
  try {
    const out = execFileSync(command, ['auth', 'status', '--json'], {
      timeout: AUTH_TIMEOUT_MS,
      stdio: 'pipe',
      shell: process.platform === 'win32',
    }).toString()
    debugLog('auth status --json output:', out.slice(0, 200))
    const parsed = parseAuthStatus(out)
    if (parsed !== null) return parsed
  } catch (error) {
    debugLog('auth status --json threw:', (error as Error).message?.slice(0, 200))
  }

  // Fallback: plain `auth status` (older CLIs that don't accept --json).
  try {
    const out = execFileSync(command, ['auth', 'status'], {
      timeout: AUTH_TIMEOUT_MS,
      stdio: 'pipe',
      shell: process.platform === 'win32',
    }).toString()
    debugLog('auth status output:', out.slice(0, 200))
    return parseAuthStatus(out)
  } catch (error) {
    debugLog('auth status threw:', (error as Error).message?.slice(0, 200))
    return null
  }
}

/**
 * Check if the `claude` binary is installed (regardless of auth state).
 */
export function isClaudeBinaryInstalled(): boolean {
  return findWorkingCommand() !== null
}

/**
 * Check if the `claude` CLI is installed AND authenticated.
 */
export function isClaudeCliReady(): boolean {
  const command = findWorkingCommand()
  if (!command) return false
  return probeAuth(command) === true
}
