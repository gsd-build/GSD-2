/**
 * agent-end-retry.test.ts — Verifies the deferred agent_end retry mechanism (#1072).
 *
 * When handleAgentEnd is already running and a second agent_end event fires
 * (e.g. a hook/triage/quick-task unit dispatched inside handleAgentEnd completes
 * before it returns), the reentrancy guard must not silently drop the event.
 * Instead, it should queue a retry via pendingAgentEndRetry so the completed
 * unit's agent_end is processed after the current handler finishes.
 *
 * Without this, auto-mode can stall permanently in the "summarizing" phase
 * with no unit running and no watchdog set.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTO_TS_PATH = join(__dirname, "..", "auto.ts");
const SESSION_TS_PATH = join(__dirname, "..", "auto", "session.ts");

function getAutoTsSource(): string {
  return readFileSync(AUTO_TS_PATH, "utf-8");
}

function getSessionTsSource(): string {
  return readFileSync(SESSION_TS_PATH, "utf-8");
}

// ── AutoSession must declare pendingAgentEndRetry ────────────────────────────

test("AutoSession declares pendingAgentEndRetry field", () => {
  const source = getSessionTsSource();
  assert.ok(
    source.includes("pendingAgentEndRetry"),
    "AutoSession (auto/session.ts) must declare pendingAgentEndRetry field for deferred retry",
  );
});

test("AutoSession resets pendingAgentEndRetry in reset()", () => {
  const source = getSessionTsSource();
  // Find the reset() method — it's declared as "reset(): void {"
  const resetIdx = source.indexOf("reset(): void");
  assert.ok(resetIdx > -1, "AutoSession must have a reset() method");
  const resetBlock = source.slice(resetIdx, resetIdx + 3000);
  assert.ok(
    resetBlock.includes("pendingAgentEndRetry"),
    "reset() must clear pendingAgentEndRetry",
  );
});

// ── handleAgentEnd reentrancy guard must queue retry ─────────────────────────

test("handleAgentEnd sets pendingAgentEndRetry when reentrant", () => {
  const source = getAutoTsSource();
  // Find the handleAgentEnd function
  const fnIdx = source.indexOf("export async function handleAgentEnd");
  assert.ok(fnIdx > -1, "handleAgentEnd must exist in auto.ts");

  // The reentrancy guard section (within ~500 chars of the function start)
  const guardBlock = source.slice(fnIdx, fnIdx + 800);
  assert.ok(
    guardBlock.includes("s.handlingAgentEnd"),
    "handleAgentEnd must check s.handlingAgentEnd",
  );
  assert.ok(
    guardBlock.includes("pendingAgentEndRetry = true"),
    "reentrancy guard must set pendingAgentEndRetry = true instead of silently dropping (#1072)",
  );
});

// ── finally block must process pendingAgentEndRetry ──────────────────────────

test("handleAgentEnd finally block retries if pendingAgentEndRetry is set", () => {
  const source = getAutoTsSource();
  const fnIdx = source.indexOf("export async function handleAgentEnd");
  assert.ok(fnIdx > -1, "handleAgentEnd must exist");

  // Find the finally block within handleAgentEnd (search for the closing pattern)
  const fnBlock = source.slice(fnIdx, source.indexOf("\n// ─── ", fnIdx + 100));
  assert.ok(
    fnBlock.includes("pendingAgentEndRetry"),
    "handleAgentEnd finally block must check pendingAgentEndRetry",
  );
  assert.ok(
    fnBlock.includes("setImmediate"),
    "deferred retry must use setImmediate to avoid stack overflow (#1072)",
  );
  assert.ok(
    fnBlock.includes("handleAgentEnd(ctx, pi)"),
    "deferred retry must call handleAgentEnd recursively (#1072)",
  );
});

// ── Regression: reentrancy guard must NOT silently return ─────────────────────

test("reentrancy guard references issue #1072", () => {
  const source = getAutoTsSource();
  const fnIdx = source.indexOf("export async function handleAgentEnd");
  const guardBlock = source.slice(fnIdx, fnIdx + 800);
  assert.ok(
    guardBlock.includes("1072"),
    "reentrancy guard comment must reference #1072 for traceability",
  );
});
