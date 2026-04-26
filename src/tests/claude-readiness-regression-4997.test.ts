/**
 * Regression tests for Issue #4997 — v2.78.0 stopped recognizing
 * authenticated Claude Code CLI installs on Windows.
 *
 * Three root causes are pinned by these tests:
 *   1. `claude auth status` emits JSON by default (`{"loggedIn": true}`).
 *      The previous text-only regex couldn't distinguish authed vs unauthed
 *      JSON output, and a hard reliance on text matching could break when
 *      the CLI's output format changed.
 *   2. Older Claude CLIs don't accept `--json` — the probe must fall back
 *      to plain `claude auth status`.
 *   3. With `shell: process.platform === 'win32'` the spawn goes through
 *      cmd.exe → claude.cmd → node. A missing first candidate surfaces as
 *      a non-zero cmd.exe exit (no ENOENT errno) and a slow first
 *      candidate can exceed the 5s timeout — both must advance to the
 *      next candidate, not abort detection.
 *
 * These are source-level assertions because the production code paths
 * spawn a real binary; behaviour testing the live spawn would couple the
 * suite to the local install state.
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const readinessSource = readFileSync(
  join(__dirname, "..", "resources", "extensions", "claude-code-cli", "readiness.ts"),
  "utf-8",
);

const cliCheckSource = readFileSync(
  join(__dirname, "..", "claude-cli-check.ts"),
  "utf-8",
);

describe("Claude auth detection — JSON output (#4997)", () => {
  test("readiness.ts requests --json from claude auth status", () => {
    assert.match(
      readinessSource,
      /\["auth",\s*"status",\s*"--json"\]/,
      "readiness.ts must request structured JSON output",
    );
  });

  test("claude-cli-check.ts requests --json from claude auth status", () => {
    assert.match(
      cliCheckSource,
      /\['auth',\s*'status',\s*'--json'\]/,
      "claude-cli-check.ts must request structured JSON output",
    );
  });

  test("readiness.ts inspects the loggedIn field", () => {
    assert.match(
      readinessSource,
      /loggedIn/,
      "readiness.ts must inspect the loggedIn field from JSON output",
    );
  });

  test("claude-cli-check.ts inspects the loggedIn field", () => {
    assert.match(
      cliCheckSource,
      /loggedIn/,
      "claude-cli-check.ts must inspect the loggedIn field from JSON output",
    );
  });
});

describe("Claude auth detection — older CLI fallback (#4997)", () => {
  test("readiness.ts falls back to plain auth status when --json fails", () => {
    // Both the --json variant and a non-flag variant must appear so the
    // probe can degrade to older CLIs that don't accept --json.
    assert.match(
      readinessSource,
      /\["auth",\s*"status"\]/,
      "readiness.ts must include a non-JSON auth status fallback",
    );
  });

  test("claude-cli-check.ts falls back to plain auth status when --json fails", () => {
    assert.match(
      cliCheckSource,
      /\['auth',\s*'status'\]/,
      "claude-cli-check.ts must include a non-JSON auth status fallback",
    );
  });
});

describe("Claude auth detection — Windows candidate iteration (#4997)", () => {
  test("readiness.ts uses a permissive 'find first working binary' probe", () => {
    // With shell: true, a missing candidate surfaces as a non-zero cmd.exe
    // exit rather than ENOENT — the iteration must catch any error and
    // advance, not branch on errno codes.
    assert.match(
      readinessSource,
      /findWorkingCommand|for\s*\(\s*const\s+command\s+of\s+CLAUDE_COMMAND_CANDIDATES[\s\S]*?catch[\s\S]*?continue/,
      "readiness.ts must iterate candidates with a catch-all continue, not an errno allowlist",
    );
  });

  test("claude-cli-check.ts uses a permissive 'find first working binary' probe", () => {
    assert.match(
      cliCheckSource,
      /findWorkingCommand|for\s*\(\s*const\s+command\s+of\s+CLAUDE_COMMAND_CANDIDATES[\s\S]*?catch[\s\S]*?continue/,
      "claude-cli-check.ts must iterate candidates with a catch-all continue, not an errno allowlist",
    );
  });

  test("readiness.ts uses a longer timeout for the auth probe", () => {
    assert.match(
      readinessSource,
      /AUTH_TIMEOUT_MS\s*=\s*1[0-9]_?000/,
      "readiness.ts must define AUTH_TIMEOUT_MS >= 10s",
    );
  });

  test("claude-cli-check.ts uses a longer timeout for the auth probe", () => {
    assert.match(
      cliCheckSource,
      /AUTH_TIMEOUT_MS\s*=\s*1[0-9]_?000/,
      "claude-cli-check.ts must define AUTH_TIMEOUT_MS >= 10s",
    );
  });
});

describe("Claude auth detection — debug logging (#4997)", () => {
  test("readiness.ts honors GSD_CLAUDE_DEBUG", () => {
    assert.match(
      readinessSource,
      /GSD_CLAUDE_DEBUG/,
      "readiness.ts must support GSD_CLAUDE_DEBUG=1 for diagnosing platform-specific failures",
    );
  });

  test("claude-cli-check.ts honors GSD_CLAUDE_DEBUG", () => {
    assert.match(
      cliCheckSource,
      /GSD_CLAUDE_DEBUG/,
      "claude-cli-check.ts must support GSD_CLAUDE_DEBUG=1 for diagnosing platform-specific failures",
    );
  });
});
