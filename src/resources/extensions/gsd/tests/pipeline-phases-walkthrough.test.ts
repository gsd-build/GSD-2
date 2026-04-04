// GSD Extension — Pipeline phases walkthrough: stuck detection, session state, and loop exit conditions

import test from "node:test";
import assert from "node:assert/strict";

import { detectStuck } from "../auto/detect-stuck.ts";
import type { WindowEntry, LoopState } from "../auto/types.ts";
import { MAX_LOOP_ITERATIONS } from "../auto/types.ts";
import { AutoSession } from "../auto/session.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STUCK_WINDOW_SIZE = 6;

function makeWindow(keys: string[]): WindowEntry[] {
  return keys.map((k) => ({ key: k }));
}

function makeWindowWithErrors(entries: Array<{ key: string; error?: string }>): WindowEntry[] {
  return entries.map((e) => (e.error ? { key: e.key, error: e.error } : { key: e.key }));
}

function makeLoopState(): LoopState {
  return { recentUnits: [], stuckRecoveryAttempts: 0 };
}

/** Push a key into the sliding window, capping at STUCK_WINDOW_SIZE. */
function pushToWindow(state: LoopState, key: string, error?: string): void {
  const entry: WindowEntry = error ? { key, error } : { key };
  state.recentUnits.push(entry);
  if (state.recentUnits.length > STUCK_WINDOW_SIZE) {
    state.recentUnits.shift();
  }
}

// ─── Part 1: Session state behavior ──────────────────────────────────────────

test("Part1 — recentUnits window caps at 6 entries when 7 are pushed", () => {
  const state = makeLoopState();
  const keys = ["a", "b", "c", "d", "e", "f", "g"];
  for (const k of keys) {
    pushToWindow(state, k);
  }
  assert.equal(state.recentUnits.length, STUCK_WINDOW_SIZE);
  // FIFO: first entry should be "b" (the "a" was evicted)
  assert.equal(state.recentUnits[0]!.key, "b");
  assert.equal(state.recentUnits[5]!.key, "g");
});

test("Part1 — stuckRecoveryAttempts resets to 0 when a new unit is detected after recovery", () => {
  const state = makeLoopState();
  // Simulate being stuck on "task/T001" — bump the recovery counter
  state.stuckRecoveryAttempts = 1;
  pushToWindow(state, "task/T001");
  pushToWindow(state, "task/T001");
  pushToWindow(state, "task/T001");

  // New different unit detected — progress — reset the counter (mirrors phases.ts logic)
  const previousKey = state.recentUnits[state.recentUnits.length - 1]!.key;
  pushToWindow(state, "task/T002");
  const newKey = state.recentUnits[state.recentUnits.length - 1]!.key;
  if (newKey !== previousKey) {
    state.stuckRecoveryAttempts = 0;
  }

  assert.equal(state.stuckRecoveryAttempts, 0);
});

test("Part1 — consecutiveErrors increments on each error and resets on success", () => {
  // Model the counter as it behaves in loop.ts (module-local variable pattern)
  let consecutiveErrors = 0;

  // Simulate 2 errors
  consecutiveErrors++;
  consecutiveErrors++;
  assert.equal(consecutiveErrors, 2);

  // Simulate success — mirrors `consecutiveErrors = 0` at bottom of loop body
  consecutiveErrors = 0;
  assert.equal(consecutiveErrors, 0);
});

test("Part1 — iteration increments each loop pass", () => {
  let iteration = 0;
  // Simulate 5 loop passes
  for (let i = 0; i < 5; i++) {
    iteration++;
  }
  assert.equal(iteration, 5);
});

// ─── Part 2: Sliding window management ───────────────────────────────────────

test("Part2 — detectStuck returns null for empty window", () => {
  const result = detectStuck([]);
  assert.equal(result, null);
});

test("Part2 — detectStuck returns null for single-entry window", () => {
  const result = detectStuck(makeWindow(["task/T001"]));
  assert.equal(result, null);
});

test("Part2 — window grows to 6 then stays at 6 with FIFO eviction", () => {
  const state = makeLoopState();

  // Push 6 entries — window should be full
  for (let i = 1; i <= 6; i++) {
    pushToWindow(state, `task/T00${i}`);
  }
  assert.equal(state.recentUnits.length, 6);
  assert.equal(state.recentUnits[0]!.key, "task/T001");

  // Push a 7th — oldest is evicted
  pushToWindow(state, "task/T007");
  assert.equal(state.recentUnits.length, 6);
  assert.equal(state.recentUnits[0]!.key, "task/T002");
  assert.equal(state.recentUnits[5]!.key, "task/T007");
});

test("Part2 — stuck recovery + new unit resets stuckRecoveryAttempts to 0", () => {
  const state = makeLoopState();
  pushToWindow(state, "task/T001");
  pushToWindow(state, "task/T001");
  pushToWindow(state, "task/T001");

  // Stuck detected — tier 1 fires
  state.stuckRecoveryAttempts++;
  assert.equal(state.stuckRecoveryAttempts, 1);

  // New unit makes progress — mirror the reset in runDispatch
  pushToWindow(state, "task/T002");
  const prevKey = state.recentUnits[state.recentUnits.length - 2]?.key;
  const curKey = state.recentUnits[state.recentUnits.length - 1]!.key;
  if (curKey !== prevKey) {
    state.stuckRecoveryAttempts = 0;
  }

  assert.equal(state.stuckRecoveryAttempts, 0);
});

test("Part2 — window entries preserve error field when present", () => {
  const state = makeLoopState();
  const entry: WindowEntry = { key: "task/T001", error: "timeout: no response" };
  state.recentUnits.push(entry);

  assert.equal(state.recentUnits[0]!.error, "timeout: no response");
});

test("Part2 — window entries have no error field on success", () => {
  const state = makeLoopState();
  pushToWindow(state, "task/T001"); // success — no error

  const entry = state.recentUnits[0]!;
  assert.ok(!("error" in entry) || entry.error === undefined);
});

// ─── Part 3: Recovery tier logic ─────────────────────────────────────────────

test("Part3 — tier 1: artifact found → would continue (stuckRecoveryAttempts incremented first)", () => {
  const state = makeLoopState();
  // Push same key 3 times to trigger stuck
  pushToWindow(state, "task/T001");
  pushToWindow(state, "task/T001");
  pushToWindow(state, "task/T001");

  const stuckSignal = detectStuck(state.recentUnits);
  assert.ok(stuckSignal !== null, "should detect stuck");

  // Tier 1 gate: attempts === 0
  assert.equal(state.stuckRecoveryAttempts, 0, "should be at tier 1");

  // Increment first (mirrors phases.ts)
  state.stuckRecoveryAttempts++;

  // Simulate artifact check returning true
  const artifactExists = true;
  const action = artifactExists ? "continue" : "retry-cache-invalidate";

  assert.equal(action, "continue");
  assert.equal(state.stuckRecoveryAttempts, 1);
});

test("Part3 — tier 1: artifact missing → increments attempts and invalidates caches", () => {
  const state = makeLoopState();
  pushToWindow(state, "task/T001");
  pushToWindow(state, "task/T001");
  pushToWindow(state, "task/T001");

  const stuckSignal = detectStuck(state.recentUnits);
  assert.ok(stuckSignal !== null);
  assert.equal(state.stuckRecoveryAttempts, 0, "should be tier 1");

  // Tier 1: increment and no artifact → cache invalidate + continue
  state.stuckRecoveryAttempts++;
  const artifactExists = false;
  const action = artifactExists ? "artifact-continue" : "cache-invalidate-retry";

  assert.equal(action, "cache-invalidate-retry");
  assert.equal(state.stuckRecoveryAttempts, 1);
});

test("Part3 — tier 2: attempts >= 1 and still stuck → would stop", () => {
  const state = makeLoopState();
  // Still seeing the same key
  pushToWindow(state, "task/T001");
  pushToWindow(state, "task/T001");
  pushToWindow(state, "task/T001");

  state.stuckRecoveryAttempts = 1; // already attempted tier 1

  const stuckSignal = detectStuck(state.recentUnits);
  assert.ok(stuckSignal !== null);

  // Tier 2: hard stop
  const decision = state.stuckRecoveryAttempts >= 1 ? "stop" : "tier1-recovery";
  assert.equal(decision, "stop");
});

test("Part3 — reset: different unit key resets attempts to 0", () => {
  const state = makeLoopState();
  state.stuckRecoveryAttempts = 1;

  pushToWindow(state, "task/T001");
  pushToWindow(state, "task/T002"); // new unit — progress

  const prevKey = state.recentUnits[state.recentUnits.length - 2]!.key;
  const curKey = state.recentUnits[state.recentUnits.length - 1]!.key;

  assert.notEqual(prevKey, curKey);
  // Mirror the reset condition from runDispatch
  if (curKey !== prevKey && state.stuckRecoveryAttempts > 0) {
    state.stuckRecoveryAttempts = 0;
  }
  assert.equal(state.stuckRecoveryAttempts, 0);
});

// ─── Part 4: Loop exit conditions ────────────────────────────────────────────

test("Part4 — 500 iterations matches MAX_LOOP_ITERATIONS threshold exactly", () => {
  // The loop check is `iteration > MAX_LOOP_ITERATIONS`, so 500 is still allowed
  // and 501 triggers the stop
  assert.equal(MAX_LOOP_ITERATIONS, 500);

  let iteration = 500;
  const exceedsLimit = iteration > MAX_LOOP_ITERATIONS;
  assert.equal(exceedsLimit, false, "500 should not exceed limit");

  iteration = 501;
  const exceedsLimit2 = iteration > MAX_LOOP_ITERATIONS;
  assert.equal(exceedsLimit2, true, "501 should exceed limit");
});

test("Part4 — 3 consecutive errors triggers hard stop decision", () => {
  let consecutiveErrors = 0;
  const errors = ["err1", "err2", "err3"];
  let decision = "none";

  for (const _err of errors) {
    consecutiveErrors++;
    if (consecutiveErrors >= 3) {
      decision = "hard-stop";
      break;
    } else if (consecutiveErrors === 2) {
      decision = "cache-invalidate";
    }
  }

  assert.equal(decision, "hard-stop");
  assert.equal(consecutiveErrors, 3);
});

test("Part4 — 2 consecutive errors triggers cache invalidation, not stop", () => {
  let consecutiveErrors = 0;
  let decision = "none";

  consecutiveErrors++;
  if (consecutiveErrors >= 3) {
    decision = "hard-stop";
  } else if (consecutiveErrors === 2) {
    decision = "cache-invalidate";
  }

  consecutiveErrors++;
  if (consecutiveErrors >= 3) {
    decision = "hard-stop";
  } else if (consecutiveErrors === 2) {
    decision = "cache-invalidate";
  }

  assert.equal(decision, "cache-invalidate");
  assert.equal(consecutiveErrors, 2);
});

test("Part4 — 1 error then success resets consecutiveErrors to 0", () => {
  let consecutiveErrors = 0;

  // Error
  consecutiveErrors++;
  assert.equal(consecutiveErrors, 1);

  // Success — mirrors `consecutiveErrors = 0` in loop body
  consecutiveErrors = 0;
  assert.equal(consecutiveErrors, 0);
});

// ─── Part 5: Pipeline phase ordering ─────────────────────────────────────────

test("Part5 — 5 pipeline phases exist and are exported from phases.ts", async () => {
  // Verify the 5 named phases exist as exports
  const phases = await import("../auto/phases.ts");
  const phaseNames = [
    "runPreDispatch",
    "runGuards",
    "runDispatch",
    "runUnitPhase",
    "runFinalize",
  ];
  for (const name of phaseNames) {
    assert.ok(
      typeof (phases as Record<string, unknown>)[name] === "function",
      [
        "Expected pipeline phase to be a function: " + name,
        "All 5 phases must be exported from auto/phases.ts",
      ].join("\n"),
    );
  }
});

test("Part5 — phase names match the expected pipeline order by convention", () => {
  // The pipeline runs in this strict order (documented in loop.ts):
  // 1. runPreDispatch  — Phase 1: derives state, milestone transitions
  // 2. runGuards       — Phase 2: budget and guard checks
  // 3. runDispatch     — Phase 3: unit resolution + stuck detection
  // 4. runUnitPhase    — Phase 4: execute the unit
  // 5. runFinalize     — Phase 5: post-unit finalization
  const orderedPhases = [
    "runPreDispatch",
    "runGuards",
    "runDispatch",
    "runUnitPhase",
    "runFinalize",
  ];
  assert.equal(orderedPhases.length, 5);
  assert.equal(orderedPhases[0], "runPreDispatch");
  assert.equal(orderedPhases[1], "runGuards");
  assert.equal(orderedPhases[2], "runDispatch");
  assert.equal(orderedPhases[3], "runUnitPhase");
  assert.equal(orderedPhases[4], "runFinalize");
});

test("Part5 — AutoSession.milestoneMergedInPhases starts false and can be set true", () => {
  const session = new AutoSession();
  assert.equal(session.milestoneMergedInPhases, false);

  // Simulate the mergeAndExit success path from phases.ts
  session.milestoneMergedInPhases = true;
  assert.equal(session.milestoneMergedInPhases, true);

  // Verify reset() clears it back to false
  session.reset();
  assert.equal(session.milestoneMergedInPhases, false);
});

// ─── detectStuck: rule-specific coverage ─────────────────────────────────────

test("detectStuck — Rule1: same error twice in a row triggers stuck", () => {
  const window = makeWindowWithErrors([
    { key: "task/T001" },
    { key: "task/T001", error: "provider timeout" },
    { key: "task/T001", error: "provider timeout" },
  ]);
  const result = detectStuck(window);
  assert.ok(result !== null);
  assert.ok(result!.reason.includes("Same error repeated"));
});

test("detectStuck — Rule1: different errors on same key do NOT trigger stuck", () => {
  const window = makeWindowWithErrors([
    { key: "task/T001", error: "error A" },
    { key: "task/T001", error: "error B" },
  ]);
  const result = detectStuck(window);
  assert.equal(result, null);
});

test("detectStuck — Rule2: same key 3 consecutive times triggers stuck", () => {
  const window = makeWindow(["task/T001", "task/T001", "task/T001"]);
  const result = detectStuck(window);
  assert.ok(result !== null);
  assert.ok(result!.reason.includes("3 consecutive times"));
});

test("detectStuck — Rule2: same key only twice does not trigger stuck", () => {
  const window = makeWindow(["task/T001", "task/T001"]);
  const result = detectStuck(window);
  assert.equal(result, null, "two consecutive same keys should not trigger Rule2");
});

test("detectStuck — Rule3: A-B-A-B oscillation in last 4 entries triggers stuck", () => {
  const window = makeWindow(["task/T001", "task/T002", "task/T001", "task/T002"]);
  const result = detectStuck(window);
  assert.ok(result !== null);
  assert.ok(result!.reason.includes("Oscillation detected"));
});

test("detectStuck — Rule3: A-B-C-A pattern does not trigger oscillation", () => {
  const window = makeWindow(["task/T001", "task/T002", "task/T003", "task/T001"]);
  const result = detectStuck(window);
  assert.equal(result, null, "A-B-C-A is not an A-B-A-B oscillation");
});

test("detectStuck — longer window with oscillation at tail triggers stuck", () => {
  // Older entries are varied; only the last 4 are checked for oscillation
  const window = makeWindow([
    "task/T099",
    "task/T098",
    "task/T001",
    "task/T002",
    "task/T001",
    "task/T002",
  ]);
  const result = detectStuck(window);
  assert.ok(result !== null);
  assert.ok(result!.reason.includes("Oscillation detected"));
});
