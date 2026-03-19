/**
 * dispatch-stall-guard.test.ts — Verifies defensive guards against dispatch stalls (#1073).
 *
 * In the new architecture (S01), the autoLoop() while loop replaces the
 * recursive dispatchNextUnit chain. Stall prevention is now provided by:
 * 1. runUnit() in auto-loop.ts wraps newSession() with a Promise.race timeout
 * 2. The loop structure itself prevents dispatch hangs (no recursive callbacks)
 * 3. Session timeout constants remain in auto/session.ts for configurability
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTO_TS_PATH = join(__dirname, "..", "auto.ts");
const AUTO_LOOP_TS_PATH = join(__dirname, "..", "auto-loop.ts");
const SESSION_TS_PATH = join(__dirname, "..", "auto", "session.ts");

function getAutoTsSource(): string {
  return readFileSync(AUTO_TS_PATH, "utf-8");
}

function getAutoLoopTsSource(): string {
  return readFileSync(AUTO_LOOP_TS_PATH, "utf-8");
}

function getSessionTsSource(): string {
  return readFileSync(SESSION_TS_PATH, "utf-8");
}

// ── Session timeout constants ───────────────────────────────────────────────

test("AutoSession exports NEW_SESSION_TIMEOUT_MS constant", () => {
  const source = getSessionTsSource();
  assert.ok(
    source.includes("NEW_SESSION_TIMEOUT_MS"),
    "auto/session.ts must export NEW_SESSION_TIMEOUT_MS for newSession() timeout",
  );
});

test("AutoSession exports DISPATCH_HANG_TIMEOUT_MS constant", () => {
  const source = getSessionTsSource();
  assert.ok(
    source.includes("DISPATCH_HANG_TIMEOUT_MS"),
    "auto/session.ts must export DISPATCH_HANG_TIMEOUT_MS for dispatch hang detection",
  );
});

test("NEW_SESSION_TIMEOUT_MS is a reasonable value (15-120 seconds)", () => {
  const source = getSessionTsSource();
  const match = source.match(/NEW_SESSION_TIMEOUT_MS\s*=\s*(\d[\d_]*)/);
  assert.ok(match, "NEW_SESSION_TIMEOUT_MS must have a numeric value");
  const value = parseInt(match![1]!.replace(/_/g, ""), 10);
  assert.ok(value >= 15_000 && value <= 120_000,
    `NEW_SESSION_TIMEOUT_MS must be 15-120s, got ${value}ms`,
  );
});

test("DISPATCH_HANG_TIMEOUT_MS is greater than NEW_SESSION_TIMEOUT_MS", () => {
  const source = getSessionTsSource();
  const sessionMatch = source.match(/NEW_SESSION_TIMEOUT_MS\s*=\s*(\d[\d_]*)/);
  const dispatchMatch = source.match(/DISPATCH_HANG_TIMEOUT_MS\s*=\s*(\d[\d_]*)/);
  assert.ok(sessionMatch && dispatchMatch, "Both timeout constants must exist");
  const sessionTimeout = parseInt(sessionMatch![1]!.replace(/_/g, ""), 10);
  const dispatchTimeout = parseInt(dispatchMatch![1]!.replace(/_/g, ""), 10);
  assert.ok(dispatchTimeout > sessionTimeout,
    `DISPATCH_HANG_TIMEOUT_MS (${dispatchTimeout}) must be > NEW_SESSION_TIMEOUT_MS (${sessionTimeout})`,
  );
});

// ── newSession() timeout in runUnit (auto-loop.ts) ──────────────────────────

test("runUnit wraps newSession() with Promise.race timeout", () => {
  const source = getAutoLoopTsSource();
  assert.ok(
    source.includes("Promise.race") && source.includes("NEW_SESSION_TIMEOUT_MS"),
    "runUnit in auto-loop.ts must use Promise.race with NEW_SESSION_TIMEOUT_MS to timeout newSession() (#1073)",
  );
});

test("runUnit handles newSession() timeout gracefully", () => {
  const source = getAutoLoopTsSource();
  assert.ok(
    source.includes("session-timeout") || source.includes("runUnit-session-timeout"),
    "runUnit must log when newSession() times out or fails (#1073)",
  );
});

// ── The loop structure replaces dispatch hang guards ─────────────────────────

test("autoLoop uses a while loop (structural stall prevention)", () => {
  const source = getAutoLoopTsSource();
  assert.ok(
    source.includes("while (s.active)"),
    "autoLoop must use a while loop — the loop structure itself prevents dispatch stalls",
  );
});

test("autoLoop exits with explicit reason on session failure", () => {
  const source = getAutoLoopTsSource();
  assert.ok(
    source.includes('"session-failed"'),
    "autoLoop must log an explicit exit reason when session creation fails",
  );
});

// ── Constants are imported in auto.ts ────────────────────────────────────────

test("auto.ts imports NEW_SESSION_TIMEOUT_MS and DISPATCH_HANG_TIMEOUT_MS", () => {
  const source = getAutoTsSource();
  assert.ok(
    source.includes("NEW_SESSION_TIMEOUT_MS"),
    "auto.ts must import NEW_SESSION_TIMEOUT_MS from session.ts",
  );
  assert.ok(
    source.includes("DISPATCH_HANG_TIMEOUT_MS"),
    "auto.ts must import DISPATCH_HANG_TIMEOUT_MS from session.ts",
  );
});

// ── Dispatch gap watchdog still exists for safety (deleted in S03) ───────────

test("auto.ts still has startDispatchGapWatchdog (vestigial until S03)", () => {
  const source = getAutoTsSource();
  assert.ok(
    source.includes("startDispatchGapWatchdog"),
    "startDispatchGapWatchdog must still exist in auto.ts (vestigial, removed in S03)",
  );
});
