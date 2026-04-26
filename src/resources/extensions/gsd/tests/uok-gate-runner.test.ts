import test from "node:test";
import assert from "node:assert/strict";

import { closeDatabase, openDatabase, _getAdapter } from "../gsd-db.ts";
import { UokGateRunner } from "../uok/gate-runner.ts";

test.beforeEach(() => {
  closeDatabase();
  const ok = openDatabase(":memory:");
  assert.equal(ok, true);
});

test.afterEach(() => {
  closeDatabase();
});

test("uok gate runner retries timeout failures using deterministic matrix", async () => {
  const runner = new UokGateRunner();

  let calls = 0;
  runner.register({
    id: "timeout-gate",
    type: "verification",
    execute: async (_ctx, attempt) => {
      calls += 1;
      if (attempt < 2) {
        return {
          outcome: "fail",
          failureClass: "timeout",
          rationale: "first attempt timed out",
        };
      }
      return {
        outcome: "pass",
        failureClass: "none",
        rationale: "second attempt passed",
      };
    },
  });

  const result = await runner.run("timeout-gate", {
    basePath: process.cwd(),
    traceId: "trace-a",
    turnId: "turn-a",
    milestoneId: "M001",
    sliceId: "S01",
    taskId: "T01",
  });

  assert.equal(result.outcome, "pass");
  assert.equal(calls, 2);

  const adapter = _getAdapter();
  const rows = adapter?.prepare("SELECT gate_id, outcome, attempt FROM gate_runs ORDER BY id").all() ?? [];
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.["outcome"], "retry");
  assert.equal(rows[1]?.["outcome"], "pass");
});

test("uok gate runner returns manual-attention for unknown gate id", async () => {
  const runner = new UokGateRunner();
  const result = await runner.run("missing-gate", {
    basePath: process.cwd(),
    traceId: "trace-b",
    turnId: "turn-b",
  });

  assert.equal(result.outcome, "manual-attention");
  assert.equal(result.failureClass, "unknown");
});

// Regression tests for #4950

test("uok gate runner: gate.execute throws — outcome is fail, audit emitted, DB row written, no exception escapes", async () => {
  const runner = new UokGateRunner();

  runner.register({
    id: "throwing-gate",
    type: "verification",
    execute: async () => {
      throw new Error("unexpected runtime failure");
    },
  });

  let threw = false;
  let result;
  try {
    result = await runner.run("throwing-gate", {
      basePath: process.cwd(),
      traceId: "trace-throw",
      turnId: "turn-throw",
    });
  } catch {
    threw = true;
  }

  assert.equal(threw, false, "run() must not throw when gate.execute throws");
  assert.equal(result?.outcome, "fail");
  assert.equal(result?.failureClass, "unknown");
  assert.equal(result?.rationale, "unexpected runtime failure");

  const adapter = _getAdapter();
  const rows = adapter?.prepare("SELECT gate_id, outcome, failure_class FROM gate_runs WHERE gate_id = 'throwing-gate'").all() ?? [];
  assert.ok(rows.length >= 1, "at least one DB row must be written for a thrown gate");
  assert.equal(rows[0]?.["outcome"], "fail");
});

test("uok gate runner: unknown gate id emits audit + DB row with manual-attention", async () => {
  const runner = new UokGateRunner();

  await runner.run("ghost-gate", {
    basePath: process.cwd(),
    traceId: "trace-ghost",
    turnId: "turn-ghost",
  });

  const adapter = _getAdapter();
  const rows = adapter?.prepare("SELECT gate_id, outcome, failure_class FROM gate_runs WHERE gate_id = 'ghost-gate'").all() ?? [];
  assert.equal(rows.length, 1, "unknown gate must write exactly one DB row");
  assert.equal(rows[0]?.["outcome"], "manual-attention");
});

test("uok gate runner: maxAttempts reported equals retryBudget + 1", async () => {
  const runner = new UokGateRunner();

  // timeout has retryBudget=2, so maxAttempts should be 3
  runner.register({
    id: "budget-gate",
    type: "verification",
    execute: async () => ({
      outcome: "fail",
      failureClass: "timeout",
      rationale: "always fails",
    }),
  });

  const result = await runner.run("budget-gate", {
    basePath: process.cwd(),
    traceId: "trace-budget",
    turnId: "turn-budget",
  });

  // retryBudget for "timeout" is 2, so maxAttempts must be 3
  assert.equal(result.maxAttempts, 3, "maxAttempts must equal retryBudget + 1");
});
