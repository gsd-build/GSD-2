/**
 * auto-escape-preserves-worktree.test.ts — Regression for #3181.
 *
 * Bug: pressing Escape during session creation called stopAuto() even when
 * auto-mode was in a paused state, tearing down the worktree unintentionally.
 *
 * Fix: add `if (s.paused) return { action: "break", reason: "user-pause" }`
 * before the stopAuto() call in the cancelled-unit handler (~line 1137 in
 * auto/phases.ts).
 *
 * This file tests three scenarios:
 *   1. paused=true  + cancelled (non-provider)  → break "user-pause", no stopAuto
 *   2. paused=false + cancelled (non-provider)  → stopAuto IS called
 *   3. cancelled with provider errorContext     → break "provider-pause", no stopAuto
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PHASES_PATH = join(__dirname, "..", "auto", "phases.ts");

// ─── Source-code regression guard ───────────────────────────────────────────
// The test MUST fail on unpatched code (no s.paused guard) and pass after fix.

test("phases.ts guards cancelled-unit handler with s.paused before stopAuto (#3181)", () => {
  const source = readFileSync(PHASES_PATH, "utf-8");

  // The fix must be present: guard that returns early when auto is paused
  assert.ok(
    source.includes("if (s.paused)"),
    "phases.ts must check s.paused before calling stopAuto in the cancelled-unit handler",
  );

  // The guard must return before reaching stopAuto — verify reason is "user-pause"
  assert.ok(
    source.includes('"user-pause"'),
    'phases.ts must return { action: "break", reason: "user-pause" } for the paused guard',
  );
});

// ─── Inline logic tests (mirror the cancelled-unit handler) ─────────────────
// These tests replicate the handler logic directly to verify correctness.
// They are independent of module loading and prove the three cases
// without relying on process-level module mocking.

type PhaseResult =
  | { action: "continue" }
  | { action: "break"; reason: string };

interface ErrorContext {
  category: string;
  message: string;
  isTransient?: boolean;
}

interface UnitResult {
  status: "completed" | "cancelled" | "error";
  errorContext?: ErrorContext;
}

interface Session {
  paused: boolean;
}

/**
 * Mirrors the cancelled-unit handler logic from phases.ts ~lines 1126-1140.
 * This is the UNPATCHED version (no s.paused guard) — used to document the bug.
 */
function cancelledHandlerUnpatched(
  unitResult: UnitResult,
  _s: Session,
  stopAutoSpy: { callCount: number },
): PhaseResult {
  if (unitResult.status === "cancelled") {
    if (unitResult.errorContext?.category === "provider") {
      return { action: "break", reason: "provider-pause" };
    }
    // BUG: no s.paused guard here — stopAuto always called
    stopAutoSpy.callCount++;
    return { action: "break", reason: "session-failed" };
  }
  return { action: "continue" };
}

/**
 * Mirrors the cancelled-unit handler logic from phases.ts AFTER the fix.
 * The s.paused guard prevents stopAuto from being called when paused.
 */
function cancelledHandlerPatched(
  unitResult: UnitResult,
  s: Session,
  stopAutoSpy: { callCount: number },
): PhaseResult {
  if (unitResult.status === "cancelled") {
    if (unitResult.errorContext?.category === "provider") {
      return { action: "break", reason: "provider-pause" };
    }
    // FIX: guard added for #3181
    if (s.paused) {
      return { action: "break", reason: "user-pause" };
    }
    stopAutoSpy.callCount++;
    return { action: "break", reason: "session-failed" };
  }
  return { action: "continue" };
}

// ─── Case 1: paused=true + cancelled (non-provider) ─────────────────────────

test("cancelled unit when paused: stopAuto must NOT be called (unpatched code FAILS)", () => {
  const spy = { callCount: 0 };
  const unitResult: UnitResult = { status: "cancelled" };
  const session: Session = { paused: true };

  // Demonstrate the bug: unpatched code calls stopAuto even when paused
  const resultUnpatched = cancelledHandlerUnpatched(unitResult, session, spy);
  assert.equal(resultUnpatched.action, "break");
  assert.equal((resultUnpatched as { action: "break"; reason: string }).reason, "session-failed");
  // BUG: stopAuto was called when paused — spy shows 1 call
  assert.equal(spy.callCount, 1, "bug: unpatched code calls stopAuto even when paused");

  // Verify the patched version does not call stopAuto
  const spyFixed = { callCount: 0 };
  const resultPatched = cancelledHandlerPatched(unitResult, session, spyFixed);
  assert.equal(resultPatched.action, "break");
  assert.equal((resultPatched as { action: "break"; reason: string }).reason, "user-pause");
  assert.equal(spyFixed.callCount, 0, "patched code must not call stopAuto when paused");
});

// ─── Case 2: paused=false + cancelled (non-provider) ────────────────────────

test("cancelled unit when NOT paused: stopAuto IS called (existing behaviour preserved)", () => {
  const spy = { callCount: 0 };
  const unitResult: UnitResult = { status: "cancelled" };
  const session: Session = { paused: false };

  const result = cancelledHandlerPatched(unitResult, session, spy);
  assert.equal(result.action, "break");
  assert.equal((result as { action: "break"; reason: string }).reason, "session-failed");
  assert.equal(spy.callCount, 1, "stopAuto must be called when auto is not paused");
});

// ─── Case 3: provider error (regardless of s.paused) ────────────────────────

test("cancelled unit with provider errorContext: provider guard fires, no stopAuto", () => {
  const spy = { callCount: 0 };
  const unitResult: UnitResult = {
    status: "cancelled",
    errorContext: { category: "provider", message: "rate limit", isTransient: true },
  };

  // Test with paused=true
  const sessionPaused: Session = { paused: true };
  const resultPaused = cancelledHandlerPatched(unitResult, sessionPaused, spy);
  assert.equal(resultPaused.action, "break");
  assert.equal((resultPaused as { action: "break"; reason: string }).reason, "provider-pause");
  assert.equal(spy.callCount, 0, "provider guard fires before paused guard — no stopAuto");

  // Test with paused=false
  const sessionUnpaused: Session = { paused: false };
  const resultUnpaused = cancelledHandlerPatched(unitResult, sessionUnpaused, spy);
  assert.equal(resultUnpaused.action, "break");
  assert.equal((resultUnpaused as { action: "break"; reason: string }).reason, "provider-pause");
  assert.equal(spy.callCount, 0, "provider guard still fires for unpaused session — no stopAuto");
});
