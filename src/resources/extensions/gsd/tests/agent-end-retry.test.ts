/**
 * agent-end-retry.test.ts — Regression checks for the agent_end model.
 *
 * The per-unit one-shot resolve function lives at module level in auto-loop.ts
 * (_currentResolve). handleAgentEnd is a thin compatibility wrapper around
 * resolveAgentEnd().
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

test("auto-loop.ts declares _currentResolve for per-unit one-shot promises", () => {
  const source = getAutoLoopTsSource();
  assert.ok(
    source.includes("_currentResolve"),
    "auto-loop.ts must declare _currentResolve for the per-unit resolve function",
  );
  assert.ok(
    source.includes("_sessionSwitchInFlight"),
    "auto-loop.ts must declare _sessionSwitchInFlight guard",
  );
});

test("AutoSession no longer holds promise state (moved to auto-loop.ts module scope)", () => {
  const source = getSessionTsSource();
  // Properties should NOT exist as class fields
  assert.ok(
    !source.includes("pendingResolve:"),
    "AutoSession must not declare pendingResolve (moved to auto-loop.ts)",
  );
  assert.ok(
    !source.includes("pendingAgentEndQueue:"),
    "AutoSession must not declare pendingAgentEndQueue (removed — events are dropped)",
  );
});

test("legacy pendingAgentEndRetry state is gone", () => {
  const source = getSessionTsSource();
  assert.ok(
    !source.includes("pendingAgentEndRetry"),
    "AutoSession should no longer use legacy pendingAgentEndRetry state",
  );
});

test("handleAgentEnd is a thin compatibility wrapper", () => {
  const source = getAutoTsSource();
  const fnIdx = source.indexOf("export async function handleAgentEnd");
  assert.ok(fnIdx > -1, "handleAgentEnd must exist in auto.ts");
  const fnBlock = source.slice(fnIdx, source.indexOf("\n// ─── ", fnIdx + 100));

  assert.ok(
    fnBlock.includes("resolveAgentEnd("),
    "handleAgentEnd must delegate to resolveAgentEnd",
  );
  assert.ok(
    !fnBlock.includes("pendingAgentEndRetry"),
    "handleAgentEnd must not use legacy retry state",
  );
  assert.ok(
    !fnBlock.includes("dispatchNextUnit"),
    "handleAgentEnd must not dispatch recursively",
  );
});
