/**
 * budget-prediction.test.ts — unit tests for budget prediction math
 * (`getAverageCostPerUnitType`, `predictRemainingCost`) exported from
 * `metrics.ts`.
 *
 * The previous version (PR #582, `972dd05f4`) re-implemented both
 * functions inline, citing a `paths.js → @gsd/pi-coding-agent` import
 * chain as the reason. That chain concern is no longer valid — the
 * real exports import cleanly from `metrics.ts`. All 10 math tests
 * were then exercising the test's own copy of the functions, not the
 * product code. #4840 documented the false-coverage case.
 *
 * This rewrite imports the real functions, deletes the inline copies,
 * drops the 3 source-grep tests (`metricsSrc.includes(...)`) and the
 * 2 dashboard `includes` tests (dashboard integration should be a
 * behaviour test against the dashboard builder, not a grep), and
 * deletes the synthesized `downgrade:` test that exercised a local
 * closure instead of product code. See #4784 / #4840.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  getAverageCostPerUnitType,
  predictRemainingCost,
} from "../metrics.ts";
import type { UnitMetrics } from "../metrics.ts";

// ─── Fixture helper ───────────────────────────────────────────────────────
// UnitMetrics has several required fields; this builder lets each test
// specify only the fields that matter for the cost math.

function makeUnit(partial: Partial<UnitMetrics> & { type: string; cost: number }): UnitMetrics {
  return {
    id: "M001/S01/T01",
    model: "test-model",
    startedAt: 0,
    finishedAt: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    toolCalls: 0,
    assistantMessages: 0,
    userMessages: 0,
    ...partial,
  };
}

describe("getAverageCostPerUnitType (metrics.ts)", () => {
  test("returns correct averages per unit type", () => {
    const units = [
      makeUnit({ type: "execute-task", cost: 0.1 }),
      makeUnit({ type: "execute-task", cost: 0.2 }),
      makeUnit({ type: "plan-slice", cost: 0.05 }),
      makeUnit({ type: "plan-slice", cost: 0.15 }),
      makeUnit({ type: "complete-slice", cost: 0.08 }),
    ];
    const avgs = getAverageCostPerUnitType(units);
    assert.ok(Math.abs(avgs.get("execute-task")! - 0.15) < 0.001, "execute-task avg");
    assert.ok(Math.abs(avgs.get("plan-slice")! - 0.10) < 0.001, "plan-slice avg");
    assert.ok(Math.abs(avgs.get("complete-slice")! - 0.08) < 0.001, "complete-slice avg");
  });

  test("returns empty map for empty input", () => {
    assert.equal(getAverageCostPerUnitType([]).size, 0);
  });

  test("single unit per type returns exact cost", () => {
    const avgs = getAverageCostPerUnitType([makeUnit({ type: "execute-task", cost: 0.42 })]);
    assert.ok(Math.abs(avgs.get("execute-task")! - 0.42) < 0.001);
  });
});

describe("predictRemainingCost (metrics.ts)", () => {
  test("calculates remaining cost from known averages", () => {
    const avgs = new Map([
      ["execute-task", 0.15],
      ["plan-slice", 0.10],
      ["complete-slice", 0.08],
    ]);
    const remaining = ["execute-task", "execute-task", "complete-slice"];
    const cost = predictRemainingCost(avgs, remaining);
    // 2 × 0.15 + 0.08 = 0.38
    assert.ok(Math.abs(cost - 0.38) < 0.001);
  });

  test("uses overall average for unknown unit types", () => {
    const avgs = new Map([
      ["execute-task", 0.10],
      ["plan-slice", 0.20],
    ]);
    const remaining = ["execute-task", "unknown-type"];
    // unknown: (0.10 + 0.20) / 2 = 0.15 → total 0.10 + 0.15 = 0.25
    assert.ok(Math.abs(predictRemainingCost(avgs, remaining) - 0.25) < 0.001);
  });

  test("returns 0 for empty remaining list", () => {
    const avgs = new Map([["execute-task", 0.15]]);
    assert.equal(predictRemainingCost(avgs, []), 0);
  });

  test("uses fallback when no averages are known", () => {
    const cost = predictRemainingCost(new Map(), ["execute-task", "plan-slice"], 0.10);
    assert.ok(Math.abs(cost - 0.20) < 0.001);
  });

  test("returns 0 when no averages and no fallback", () => {
    assert.equal(predictRemainingCost(new Map(), ["execute-task"]), 0);
  });
});

describe("end-to-end budget prediction (composes the real functions)", () => {
  test("budget ceiling exceeded is detectable from real averages + projection", () => {
    const units = [
      makeUnit({ type: "execute-task", cost: 0.5 }),
      makeUnit({ type: "execute-task", cost: 0.6 }),
      makeUnit({ type: "plan-slice", cost: 0.3 }),
      makeUnit({ type: "complete-slice", cost: 0.2 }),
    ];
    const totalSpent = units.reduce((sum, u) => sum + u.cost, 0); // 1.60
    const avgs = getAverageCostPerUnitType(units);
    const predicted = predictRemainingCost(avgs, [
      "execute-task",
      "execute-task",
      "execute-task",
    ]);
    // avg execute-task = 0.55, predicted remaining = 3 × 0.55 = 1.65
    // total = 1.60 + 1.65 = 3.25 > 2.50 ceiling
    assert.ok(
      totalSpent + predicted > 2.5,
      "spent + predicted should exceed test ceiling",
    );
  });

  test("budget ceiling not exceeded when averages stay low", () => {
    const units = [
      makeUnit({ type: "execute-task", cost: 0.1 }),
      makeUnit({ type: "plan-slice", cost: 0.05 }),
    ];
    const totalSpent = units.reduce((sum, u) => sum + u.cost, 0); // 0.15
    const avgs = getAverageCostPerUnitType(units);
    const predicted = predictRemainingCost(avgs, ["execute-task", "complete-slice"]);
    assert.ok(
      totalSpent + predicted <= 5.0,
      "spent + predicted should stay under test ceiling",
    );
  });
});
