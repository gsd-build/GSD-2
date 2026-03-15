/**
 * Tests for GSD metrics aggregation logic.
 * Tests the pure functions — no file I/O, no extension context.
 */

import {
  type UnitMetrics,
  type TokenCounts,
  type BudgetInfo,
  classifyUnitPhase,
  aggregateByPhase,
  aggregateBySlice,
  aggregateByModel,
  getProjectTotals,
  formatCost,
  formatTokenCount,
} from "../metrics.js";
import { createTestContext } from './test-helpers.ts';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeUnit(overrides: Partial<UnitMetrics> = {}): UnitMetrics {
  return {
    type: "execute-task",
    id: "M001/S01/T01",
    model: "claude-sonnet-4-20250514",
    startedAt: 1000,
    finishedAt: 2000,
    tokens: { input: 1000, output: 500, cacheRead: 200, cacheWrite: 100, total: 1800 },
    cost: 0.05,
    toolCalls: 3,
    assistantMessages: 2,
    userMessages: 1,
    ...overrides,
  };
}

const { assertEq, assertTrue, report } = createTestContext();

function assertClose(actual: number, expected: number, tolerance: number, message: string): void {
  assertTrue(Math.abs(actual - expected) <= tolerance, `${message} — expected ~${expected}, got ${actual}`);
}

// ─── Phase classification ─────────────────────────────────────────────────────

console.log("\n=== classifyUnitPhase ===");

assertEq(classifyUnitPhase("research-milestone"), "research", "research-milestone → research");
assertEq(classifyUnitPhase("research-slice"), "research", "research-slice → research");
assertEq(classifyUnitPhase("plan-milestone"), "planning", "plan-milestone → planning");
assertEq(classifyUnitPhase("plan-slice"), "planning", "plan-slice → planning");
assertEq(classifyUnitPhase("execute-task"), "execution", "execute-task → execution");
assertEq(classifyUnitPhase("complete-slice"), "completion", "complete-slice → completion");
assertEq(classifyUnitPhase("reassess-roadmap"), "reassessment", "reassess-roadmap → reassessment");
assertEq(classifyUnitPhase("unknown-thing"), "execution", "unknown → execution (fallback)");

// ─── getProjectTotals ─────────────────────────────────────────────────────────

console.log("\n=== getProjectTotals ===");

{
  const units = [
    makeUnit({ tokens: { input: 1000, output: 500, cacheRead: 200, cacheWrite: 100, total: 1800 }, cost: 0.05, toolCalls: 3, startedAt: 1000, finishedAt: 2000 }),
    makeUnit({ tokens: { input: 2000, output: 1000, cacheRead: 400, cacheWrite: 200, total: 3600 }, cost: 0.10, toolCalls: 5, startedAt: 2000, finishedAt: 4000 }),
  ];
  const totals = getProjectTotals(units);

  assertEq(totals.units, 2, "total units");
  assertEq(totals.tokens.input, 3000, "total input tokens");
  assertEq(totals.tokens.output, 1500, "total output tokens");
  assertEq(totals.tokens.cacheRead, 600, "total cacheRead");
  assertEq(totals.tokens.cacheWrite, 300, "total cacheWrite");
  assertEq(totals.tokens.total, 5400, "total tokens");
  assertClose(totals.cost, 0.15, 0.001, "total cost");
  assertEq(totals.toolCalls, 8, "total tool calls");
  assertEq(totals.duration, 3000, "total duration");
}

{
  const totals = getProjectTotals([]);
  assertEq(totals.units, 0, "empty: zero units");
  assertEq(totals.cost, 0, "empty: zero cost");
  assertEq(totals.tokens.total, 0, "empty: zero tokens");
}

// ─── aggregateByPhase ─────────────────────────────────────────────────────────

console.log("\n=== aggregateByPhase ===");

{
  const units = [
    makeUnit({ type: "research-milestone", cost: 0.02 }),
    makeUnit({ type: "research-slice", cost: 0.03 }),
    makeUnit({ type: "plan-milestone", cost: 0.01 }),
    makeUnit({ type: "plan-slice", cost: 0.02 }),
    makeUnit({ type: "execute-task", cost: 0.10 }),
    makeUnit({ type: "execute-task", cost: 0.08 }),
    makeUnit({ type: "complete-slice", cost: 0.01 }),
    makeUnit({ type: "reassess-roadmap", cost: 0.005 }),
  ];
  const phases = aggregateByPhase(units);

  assertEq(phases.length, 5, "5 phases");
  assertEq(phases[0].phase, "research", "first phase is research");
  assertEq(phases[0].units, 2, "2 research units");
  assertClose(phases[0].cost, 0.05, 0.001, "research cost");

  assertEq(phases[1].phase, "planning", "second phase is planning");
  assertEq(phases[1].units, 2, "2 planning units");

  assertEq(phases[2].phase, "execution", "third phase is execution");
  assertEq(phases[2].units, 2, "2 execution units");
  assertClose(phases[2].cost, 0.18, 0.001, "execution cost");

  assertEq(phases[3].phase, "completion", "fourth phase is completion");
  assertEq(phases[4].phase, "reassessment", "fifth phase is reassessment");
}

// ─── aggregateBySlice ─────────────────────────────────────────────────────────

console.log("\n=== aggregateBySlice ===");

{
  const units = [
    makeUnit({ id: "M001/S01/T01", cost: 0.05 }),
    makeUnit({ id: "M001/S01/T02", cost: 0.04 }),
    makeUnit({ id: "M001/S02/T01", cost: 0.10 }),
    makeUnit({ id: "M001", type: "research-milestone", cost: 0.02 }),
  ];
  const slices = aggregateBySlice(units);

  assertEq(slices.length, 3, "3 slice groups");

  const s01 = slices.find(s => s.sliceId === "M001/S01");
  assertTrue(!!s01, "M001/S01 exists");
  assertEq(s01!.units, 2, "M001/S01 has 2 units");
  assertClose(s01!.cost, 0.09, 0.001, "M001/S01 cost");

  const s02 = slices.find(s => s.sliceId === "M001/S02");
  assertTrue(!!s02, "M001/S02 exists");
  assertEq(s02!.units, 1, "M001/S02 has 1 unit");

  const mLevel = slices.find(s => s.sliceId === "M001");
  assertTrue(!!mLevel, "M001 (milestone-level) exists");
}

// ─── aggregateByModel ─────────────────────────────────────────────────────────

console.log("\n=== aggregateByModel ===");

{
  const units = [
    makeUnit({ model: "claude-sonnet-4-20250514", cost: 0.05 }),
    makeUnit({ model: "claude-sonnet-4-20250514", cost: 0.04 }),
    makeUnit({ model: "claude-opus-4-20250514", cost: 0.30 }),
  ];
  const models = aggregateByModel(units);

  assertEq(models.length, 2, "2 models");
  // Sorted by cost desc — opus should be first
  assertEq(models[0].model, "claude-opus-4-20250514", "opus first (higher cost)");
  assertClose(models[0].cost, 0.30, 0.001, "opus cost");
  assertEq(models[1].model, "claude-sonnet-4-20250514", "sonnet second");
  assertEq(models[1].units, 2, "sonnet has 2 units");
}

// ─── formatCost ───────────────────────────────────────────────────────────────

console.log("\n=== formatCost ===");

assertEq(formatCost(0), "$0.0000", "zero cost");
assertEq(formatCost(0.001), "$0.0010", "sub-cent cost");
assertEq(formatCost(0.05), "$0.050", "5 cents");
assertEq(formatCost(1.50), "$1.50", "dollar+");
assertEq(formatCost(14.20), "$14.20", "double digits");

// ─── formatTokenCount ─────────────────────────────────────────────────────────

console.log("\n=== formatTokenCount ===");

assertEq(formatTokenCount(0), "0", "zero tokens");
assertEq(formatTokenCount(500), "500", "sub-k");
assertEq(formatTokenCount(1500), "1.5k", "1.5k");
assertEq(formatTokenCount(150000), "150.0k", "150k");
assertEq(formatTokenCount(1500000), "1.50M", "1.5M");

// ─── Backward compat: UnitMetrics without budget fields ───────────────────────

console.log("\n=== Backward compat: UnitMetrics without budget fields ===");

{
  // Simulate old metrics.json data — no budget fields present
  const oldUnit: UnitMetrics = {
    type: "execute-task",
    id: "M001/S01/T01",
    model: "claude-sonnet-4-20250514",
    startedAt: 1000,
    finishedAt: 2000,
    tokens: { input: 1000, output: 500, cacheRead: 200, cacheWrite: 100, total: 1800 },
    cost: 0.05,
    toolCalls: 3,
    assistantMessages: 2,
    userMessages: 1,
  };

  // All aggregation functions must work with old data
  const phases = aggregateByPhase([oldUnit]);
  assertEq(phases.length, 1, "backward compat: aggregateByPhase works");
  assertEq(phases[0].phase, "execution", "backward compat: correct phase");

  const slices = aggregateBySlice([oldUnit]);
  assertEq(slices.length, 1, "backward compat: aggregateBySlice works");
  assertEq(slices[0].sliceId, "M001/S01", "backward compat: correct sliceId");

  const models = aggregateByModel([oldUnit]);
  assertEq(models.length, 1, "backward compat: aggregateByModel works");

  const totals = getProjectTotals([oldUnit]);
  assertEq(totals.units, 1, "backward compat: getProjectTotals works");
  assertClose(totals.cost, 0.05, 0.001, "backward compat: cost preserved");

  // Budget fields should be undefined
  assertEq(oldUnit.contextWindowTokens, undefined, "backward compat: no contextWindowTokens");
  assertEq(oldUnit.truncationSections, undefined, "backward compat: no truncationSections");
  assertEq(oldUnit.continueHereFired, undefined, "backward compat: no continueHereFired");
}

// ─── UnitMetrics with budget fields populated ─────────────────────────────────

console.log("\n=== UnitMetrics with budget fields ===");

{
  const unitWithBudget: UnitMetrics = {
    type: "execute-task",
    id: "M002/S01/T03",
    model: "claude-sonnet-4-20250514",
    startedAt: 5000,
    finishedAt: 10000,
    tokens: { input: 3000, output: 1500, cacheRead: 600, cacheWrite: 300, total: 5400 },
    cost: 0.12,
    toolCalls: 8,
    assistantMessages: 4,
    userMessages: 3,
    contextWindowTokens: 200000,
    truncationSections: 3,
    continueHereFired: true,
  };

  // Budget fields are present
  assertEq(unitWithBudget.contextWindowTokens, 200000, "budget: contextWindowTokens present");
  assertEq(unitWithBudget.truncationSections, 3, "budget: truncationSections present");
  assertEq(unitWithBudget.continueHereFired, true, "budget: continueHereFired present");

  // Aggregation still works correctly with budget fields present
  const phases = aggregateByPhase([unitWithBudget]);
  assertEq(phases.length, 1, "budget: aggregateByPhase works");
  assertClose(phases[0].cost, 0.12, 0.001, "budget: cost aggregated correctly");

  const slices = aggregateBySlice([unitWithBudget]);
  assertEq(slices.length, 1, "budget: aggregateBySlice works");
  assertEq(slices[0].sliceId, "M002/S01", "budget: sliceId correct");

  const models = aggregateByModel([unitWithBudget]);
  assertEq(models.length, 1, "budget: aggregateByModel works");

  const totals = getProjectTotals([unitWithBudget]);
  assertEq(totals.units, 1, "budget: getProjectTotals works");
  assertEq(totals.toolCalls, 8, "budget: toolCalls aggregated");

  // Mix old and new units together
  const oldUnit = makeUnit(); // no budget fields
  const mixed = [oldUnit, unitWithBudget];
  const mixedTotals = getProjectTotals(mixed);
  assertEq(mixedTotals.units, 2, "mixed: 2 units total");
  assertClose(mixedTotals.cost, 0.17, 0.001, "mixed: costs summed correctly");

  const mixedPhases = aggregateByPhase(mixed);
  assertEq(mixedPhases.length, 1, "mixed: both are execution phase");
  assertEq(mixedPhases[0].units, 2, "mixed: both counted");
}

// ─── aggregateByModel: contextWindowTokens pick logic ─────────────────────────

console.log("\n=== aggregateByModel: contextWindowTokens pick logic ===");

{
  // Single unit with contextWindowTokens — aggregate picks it
  const units = [
    makeUnit({ model: "claude-sonnet-4-20250514", contextWindowTokens: 200000, cost: 0.05 }),
  ];
  const models = aggregateByModel(units);
  assertEq(models.length, 1, "ctxWindow: one model");
  assertEq(models[0].contextWindowTokens, 200000, "ctxWindow: picks value from unit");
}

{
  // Two units same model with different context windows — first defined value wins
  const units = [
    makeUnit({ model: "claude-sonnet-4-20250514", contextWindowTokens: 200000, cost: 0.05 }),
    makeUnit({ model: "claude-sonnet-4-20250514", contextWindowTokens: 150000, cost: 0.04 }),
  ];
  const models = aggregateByModel(units);
  assertEq(models.length, 1, "ctxWindow first-wins: one model");
  assertEq(models[0].contextWindowTokens, 200000, "ctxWindow first-wins: first value kept");
}

{
  // First unit undefined, second has value — second is picked
  const units = [
    makeUnit({ model: "claude-sonnet-4-20250514", cost: 0.05 }),
    makeUnit({ model: "claude-sonnet-4-20250514", contextWindowTokens: 200000, cost: 0.04 }),
  ];
  const models = aggregateByModel(units);
  assertEq(models[0].contextWindowTokens, 200000, "ctxWindow: picks first defined, not first unit");
}

{
  // Old units without contextWindowTokens — aggregate has undefined
  const units = [
    makeUnit({ model: "claude-sonnet-4-20250514", cost: 0.05 }),
    makeUnit({ model: "claude-sonnet-4-20250514", cost: 0.04 }),
  ];
  const models = aggregateByModel(units);
  assertEq(models[0].contextWindowTokens, undefined, "ctxWindow: undefined when no unit has it");
}

{
  // Multiple models — each gets its own context window
  const units = [
    makeUnit({ model: "claude-sonnet-4-20250514", contextWindowTokens: 200000, cost: 0.05 }),
    makeUnit({ model: "claude-opus-4-20250514", contextWindowTokens: 200000, cost: 0.30 }),
  ];
  const models = aggregateByModel(units);
  assertEq(models.length, 2, "ctxWindow multi-model: 2 models");
  const opus = models.find(m => m.model === "claude-opus-4-20250514");
  const sonnet = models.find(m => m.model === "claude-sonnet-4-20250514");
  assertEq(opus!.contextWindowTokens, 200000, "ctxWindow multi-model: opus has value");
  assertEq(sonnet!.contextWindowTokens, 200000, "ctxWindow multi-model: sonnet has value");
}

// ─── getProjectTotals: budget field aggregation ───────────────────────────────

console.log("\n=== getProjectTotals: budget field aggregation ===");

{
  // Units with truncationSections and continueHereFired — verify sums/counts
  const units = [
    makeUnit({ truncationSections: 3, continueHereFired: true }),
    makeUnit({ truncationSections: 2, continueHereFired: false }),
    makeUnit({ truncationSections: 1, continueHereFired: true }),
  ];
  const totals = getProjectTotals(units);
  assertEq(totals.totalTruncationSections, 6, "budget totals: truncation sections summed");
  assertEq(totals.continueHereFiredCount, 2, "budget totals: continueHereFired counted");
}

{
  // Old units without budget fields — verify 0 defaults
  const units = [makeUnit(), makeUnit()];
  const totals = getProjectTotals(units);
  assertEq(totals.totalTruncationSections, 0, "budget totals backward compat: truncation = 0");
  assertEq(totals.continueHereFiredCount, 0, "budget totals backward compat: continueHere = 0");
}

{
  // Mixed old and new units
  const units = [
    makeUnit(), // old, no budget fields
    makeUnit({ truncationSections: 5, continueHereFired: true }),
  ];
  const totals = getProjectTotals(units);
  assertEq(totals.totalTruncationSections, 5, "budget totals mixed: only new unit contributes");
  assertEq(totals.continueHereFiredCount, 1, "budget totals mixed: only one fired");
}

{
  // Empty input — safe defaults
  const totals = getProjectTotals([]);
  assertEq(totals.totalTruncationSections, 0, "budget totals empty: truncation = 0");
  assertEq(totals.continueHereFiredCount, 0, "budget totals empty: continueHere = 0");
}

// ─── Summary ──────────────────────────────────────────────────────────────────

report();
