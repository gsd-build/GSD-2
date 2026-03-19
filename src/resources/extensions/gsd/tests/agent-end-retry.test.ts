/**
 * agent-end-retry.test.ts — Verifies the agent_end handling mechanism.
 *
 * In the new architecture (S01), handleAgentEnd is a thin wrapper that calls
 * resolveAgentEnd(). The actual reentrancy and retry handling is done by the
 * autoLoop() while loop in auto-loop.ts, which awaits the promise resolved by
 * resolveAgentEnd() and handles inline-dispatched units via a while loop.
 *
 * The AutoSession still declares pendingAgentEndRetry (S03 removes it).
 * The core mechanism for handling concurrent agent_end events is now:
 * 1. resolveAgentEnd() in auto-loop.ts resolves the pending promise
 * 2. autoLoop() processes the unit result and handles inline dispatches
 * 3. The one-shot promise pattern prevents double-resolution
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

// ── AutoSession must declare pendingAgentEndRetry (until S03 removes it) ─────

test("AutoSession declares pendingAgentEndRetry field", () => {
  const source = getSessionTsSource();
  assert.ok(
    source.includes("pendingAgentEndRetry"),
    "AutoSession (auto/session.ts) must declare pendingAgentEndRetry field (removed in S03)",
  );
});

test("AutoSession resets pendingAgentEndRetry in reset()", () => {
  const source = getSessionTsSource();
  const resetIdx = source.indexOf("reset(): void");
  assert.ok(resetIdx > -1, "AutoSession must have a reset() method");
  const resetBlock = source.slice(resetIdx, resetIdx + 3000);
  assert.ok(
    resetBlock.includes("pendingAgentEndRetry"),
    "reset() must clear pendingAgentEndRetry",
  );
});

// ── handleAgentEnd is now a thin wrapper calling resolveAgentEnd ─────────────

test("handleAgentEnd exists in auto.ts as an exported function", () => {
  const source = getAutoTsSource();
  const fnIdx = source.indexOf("export async function handleAgentEnd");
  assert.ok(fnIdx > -1, "handleAgentEnd must still exist as an export for backward compatibility");
});

test("handleAgentEnd calls resolveAgentEnd (thin wrapper)", () => {
  const source = getAutoTsSource();
  const fnIdx = source.indexOf("export async function handleAgentEnd");
  assert.ok(fnIdx > -1, "handleAgentEnd must exist");
  // Find the next function or section boundary
  const fnEnd = source.indexOf("\n// ─── ", fnIdx + 100);
  const fnBlock = fnEnd > -1 ? source.slice(fnIdx, fnEnd) : source.slice(fnIdx, fnIdx + 1000);
  assert.ok(
    fnBlock.includes("resolveAgentEnd"),
    "handleAgentEnd must call resolveAgentEnd() as a thin wrapper",
  );
});

test("handleAgentEnd preserves s.active and s.cmdCtx guard", () => {
  const source = getAutoTsSource();
  const fnIdx = source.indexOf("export async function handleAgentEnd");
  const fnBlock = source.slice(fnIdx, fnIdx + 500);
  assert.ok(
    fnBlock.includes("s.active") && fnBlock.includes("s.cmdCtx"),
    "handleAgentEnd must preserve the s.active and s.cmdCtx early-return guards",
  );
});

// ── resolveAgentEnd in auto-loop.ts handles the promise mechanism ────────────

test("auto-loop.ts exports resolveAgentEnd", () => {
  const source = getAutoLoopTsSource();
  assert.ok(
    source.includes("export function resolveAgentEnd"),
    "auto-loop.ts must export resolveAgentEnd for the agent_end event handler",
  );
});

test("resolveAgentEnd uses one-shot pattern (nulls resolver before calling)", () => {
  const source = getAutoLoopTsSource();
  const fnIdx = source.indexOf("export function resolveAgentEnd");
  assert.ok(fnIdx > -1, "resolveAgentEnd must exist");
  const fnBlock = source.slice(fnIdx, fnIdx + 500);
  assert.ok(
    fnBlock.includes("pendingResolve = null"),
    "resolveAgentEnd must null pendingResolve before calling resolver (one-shot pattern)",
  );
});

test("resolveAgentEnd logs warning on orphan/double resolution", () => {
  const source = getAutoLoopTsSource();
  const fnIdx = source.indexOf("export function resolveAgentEnd");
  const fnBlock = source.slice(fnIdx, fnIdx + 500);
  assert.ok(
    fnBlock.includes("no-pending-promise") || fnBlock.includes("orphan"),
    "resolveAgentEnd must log a warning when called with no pending promise (orphan/double case)",
  );
});

// ── The loop handles inline dispatches that previously needed reentrancy guard ──

test("autoLoop handles inline dispatch via while loop (replaces reentrancy guard)", () => {
  const source = getAutoLoopTsSource();
  assert.ok(
    source.includes("await-inline-dispatch") || source.includes("inline-unit-complete"),
    "autoLoop must handle inline dispatches (hook/triage/quick-task agent_end events) via its while loop",
  );
});
