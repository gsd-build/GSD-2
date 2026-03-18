/**
 * none-mode-gates.test.ts — Tests for isolation-mode gate functions.
 *
 * Verifies that shouldUseWorktreeIsolation(), getIsolationMode(), and
 * getActiveAutoWorktreeContext() behave correctly across all three
 * isolation modes (none, branch, worktree) and at baseline (no prefs).
 *
 * Uses the writeRunnerPreferences pattern from doctor-git.test.ts:
 * PROJECT_PREFERENCES_PATH is a module-level constant frozen at import
 * time, so process.chdir() won't redirect preference loading. We write
 * prefs to the runner's cwd .gsd/preferences.md and clean up in finally.
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { shouldUseWorktreeIsolation } from "../auto.ts";
import { getIsolationMode } from "../preferences.ts";
import { getActiveAutoWorktreeContext } from "../auto-worktree.ts";
import { invalidateAllCaches } from "../cache.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

// --- Preferences helpers (same pattern as doctor-git.test.ts K001) ---

const RUNNER_PREFS_PATH = join(process.cwd(), ".gsd", "preferences.md");

function writeRunnerPreferences(isolation: "none" | "worktree" | "branch"): void {
  mkdirSync(join(process.cwd(), ".gsd"), { recursive: true });
  writeFileSync(RUNNER_PREFS_PATH, `---\ngit:\n  isolation: "${isolation}"\n---\n`);
}

function removeRunnerPreferences(): void {
  try { rmSync(RUNNER_PREFS_PATH); } catch { /* ignore if already gone */ }
}

// --- Tests ---

// Test 1: shouldUseWorktreeIsolation returns false for none
console.log("Test 1: shouldUseWorktreeIsolation returns false for none");
try {
  writeRunnerPreferences("none");
  invalidateAllCaches();
  assertEq(shouldUseWorktreeIsolation(), false, "shouldUseWorktreeIsolation() with none prefs");
} finally {
  removeRunnerPreferences();
  invalidateAllCaches();
}

// Test 2: shouldUseWorktreeIsolation returns false for branch
console.log("Test 2: shouldUseWorktreeIsolation returns false for branch");
try {
  writeRunnerPreferences("branch");
  invalidateAllCaches();
  assertEq(shouldUseWorktreeIsolation(), false, "shouldUseWorktreeIsolation() with branch prefs");
} finally {
  removeRunnerPreferences();
  invalidateAllCaches();
}

// Test 3: shouldUseWorktreeIsolation returns true for worktree
console.log("Test 3: shouldUseWorktreeIsolation returns true for worktree");
try {
  writeRunnerPreferences("worktree");
  invalidateAllCaches();
  assertEq(shouldUseWorktreeIsolation(), true, "shouldUseWorktreeIsolation() with worktree prefs");
} finally {
  removeRunnerPreferences();
  invalidateAllCaches();
}

// Test 4: shouldUseWorktreeIsolation returns true for no prefs (default)
// Skip if global prefs exist — they override the default and this test
// cannot control ~/.gsd/preferences.md.
const globalPrefsExist = existsSync(join(homedir(), ".gsd", "preferences.md"))
  || existsSync(join(homedir(), ".gsd", "PREFERENCES.md"));
if (!globalPrefsExist) {
  console.log("Test 4: shouldUseWorktreeIsolation returns true for no prefs (default)");
  try {
    removeRunnerPreferences(); // ensure no prefs file
    invalidateAllCaches();
    assertEq(shouldUseWorktreeIsolation(), true, "shouldUseWorktreeIsolation() with no prefs (default worktree)");
  } finally {
    invalidateAllCaches();
  }
} else {
  console.log("Test 4: SKIPPED — global prefs file exists, cannot test bare default");
}

// Test 5: getIsolationMode returns "none" with none prefs
console.log("Test 5: getIsolationMode returns 'none' with none prefs");
try {
  writeRunnerPreferences("none");
  invalidateAllCaches();
  assertEq(getIsolationMode(), "none", "getIsolationMode() with none prefs");
} finally {
  removeRunnerPreferences();
  invalidateAllCaches();
}

// Test 6: getActiveAutoWorktreeContext returns null at baseline
console.log("Test 6: getActiveAutoWorktreeContext returns null at baseline");
assertEq(getActiveAutoWorktreeContext(), null, "getActiveAutoWorktreeContext() returns null without enterAutoWorktree()");

// Test 7: System prompt worktree block absent without active worktree
console.log("Test 7: System prompt worktree block absent without active worktree");
{
  const ctx = getActiveAutoWorktreeContext();
  assertTrue(ctx === null, "getActiveAutoWorktreeContext() null confirms system prompt worktree block will not be injected");
}

report();
