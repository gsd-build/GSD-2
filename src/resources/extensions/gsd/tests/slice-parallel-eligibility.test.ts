import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDependencyDAG,
  computeParallelWaves,
  analyzeSliceEligibility,
  groupTasksByFileOverlap,
  formatSliceEligibilityReport,
} from "../slice-parallel-analysis.ts";
import type { RoadmapSliceEntry, SlicePlan } from "../types.ts";

// ─── Helper ────────────────────────────────────────────────────────────────

function makeSlice(id: string, depends: string[] = [], done = false): RoadmapSliceEntry {
  return { id, title: `Slice ${id}`, risk: "low" as const, depends, done, demo: "" };
}

// ─── buildDependencyDAG ────────────────────────────────────────────────────

test("buildDependencyDAG creates correct dependency map", () => {
  const slices = [
    makeSlice("S01"),
    makeSlice("S02", ["S01"]),
    makeSlice("S03", ["S01"]),
    makeSlice("S04", ["S02", "S03"]),
  ];

  const dag = buildDependencyDAG(slices);
  assert.equal(dag.size, 4);
  assert.equal(dag.get("S01")!.size, 0);
  assert.ok(dag.get("S02")!.has("S01"));
  assert.ok(dag.get("S03")!.has("S01"));
  assert.ok(dag.get("S04")!.has("S02"));
  assert.ok(dag.get("S04")!.has("S03"));
});

// ─── computeParallelWaves ──────────────────────────────────────────────────

test("linear roadmap produces sequential waves", () => {
  const slices = [
    makeSlice("S01"),
    makeSlice("S02", ["S01"]),
    makeSlice("S03", ["S02"]),
  ];

  const waves = computeParallelWaves(slices);
  assert.equal(waves.length, 3);
  assert.deepEqual(waves[0].sliceIds, ["S01"]);
  assert.deepEqual(waves[1].sliceIds, ["S02"]);
  assert.deepEqual(waves[2].sliceIds, ["S03"]);
});

test("wide fan-out: independent slices in same wave", () => {
  const slices = [
    makeSlice("S01", [], true), // done
    makeSlice("S02"),
    makeSlice("S03"),
    makeSlice("S04"),
  ];

  const waves = computeParallelWaves(slices);
  assert.equal(waves.length, 1);
  assert.deepEqual(waves[0].sliceIds.sort(), ["S02", "S03", "S04"]);
});

test("diamond pattern: S02+S03 parallel, S04 blocked until both done", () => {
  const slices = [
    makeSlice("S01", [], true), // done
    makeSlice("S02", ["S01"]),
    makeSlice("S03", ["S01"]),
    makeSlice("S04", ["S02", "S03"]),
  ];

  const waves = computeParallelWaves(slices);
  assert.equal(waves.length, 2);
  assert.deepEqual(waves[0].sliceIds.sort(), ["S02", "S03"]);
  assert.deepEqual(waves[1].sliceIds, ["S04"]);
});

test("all slices done produces no waves", () => {
  const slices = [
    makeSlice("S01", [], true),
    makeSlice("S02", ["S01"], true),
  ];

  const waves = computeParallelWaves(slices);
  assert.equal(waves.length, 0);
});

test("circular dependency breaks without infinite loop", () => {
  const slices = [
    makeSlice("S01", ["S02"]),
    makeSlice("S02", ["S01"]),
  ];

  const waves = computeParallelWaves(slices);
  assert.equal(waves.length, 0); // both stuck
});

// ─── analyzeSliceEligibility ──────────────────────────────────────────────

test("analyzeSliceEligibility identifies eligible slices (diamond)", () => {
  const slices = [
    makeSlice("S01", [], true),
    makeSlice("S02", ["S01"]),
    makeSlice("S03", ["S01"]),
    makeSlice("S04", ["S02", "S03"]),
  ];

  const results = analyzeSliceEligibility(slices);
  assert.equal(results.length, 4);

  const eligible = results.filter(r => r.eligible);
  assert.equal(eligible.length, 2);
  assert.deepEqual(eligible.map(r => r.sliceId).sort(), ["S02", "S03"]);

  const s04 = results.find(r => r.sliceId === "S04")!;
  assert.equal(s04.eligible, false);
  assert.ok(s04.reason.includes("S02"));
});

test("analyzeSliceEligibility marks done slices as ineligible", () => {
  const slices = [makeSlice("S01", [], true)];
  const results = analyzeSliceEligibility(slices);
  assert.equal(results[0].eligible, false);
  assert.ok(results[0].reason.includes("complete"));
});

// ─── groupTasksByFileOverlap ──────────────────────────────────────────────

test("tasks with no file overlap are grouped together", () => {
  const plan: SlicePlan = {
    id: "S01", title: "Test", goal: "", demo: "", mustHaves: [],
    filesLikelyTouched: [],
    tasks: [
      { id: "T01", title: "a", description: "", done: false, estimate: "30m", files: ["a.ts"] },
      { id: "T02", title: "b", description: "", done: false, estimate: "30m", files: ["b.ts"] },
      { id: "T03", title: "c", description: "", done: false, estimate: "30m", files: ["c.ts"] },
    ],
  };

  const groups = groupTasksByFileOverlap(plan);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].taskIds.sort(), ["T01", "T02", "T03"]);
});

test("tasks sharing files are serialized into separate groups", () => {
  const plan: SlicePlan = {
    id: "S01", title: "Test", goal: "", demo: "", mustHaves: [],
    filesLikelyTouched: [],
    tasks: [
      { id: "T01", title: "a", description: "", done: false, estimate: "30m", files: ["shared.ts", "a.ts"] },
      { id: "T02", title: "b", description: "", done: false, estimate: "30m", files: ["shared.ts", "b.ts"] },
      { id: "T03", title: "c", description: "", done: false, estimate: "30m", files: ["c.ts"] },
    ],
  };

  const groups = groupTasksByFileOverlap(plan);
  assert.equal(groups.length, 2);
  assert.ok(groups[0].taskIds.includes("T01"));
  assert.ok(groups[0].taskIds.includes("T03"));
  assert.deepEqual(groups[1].taskIds, ["T02"]);
});

test("tasks without file annotations get individual groups", () => {
  const plan: SlicePlan = {
    id: "S01", title: "Test", goal: "", demo: "", mustHaves: [],
    filesLikelyTouched: [],
    tasks: [
      { id: "T01", title: "a", description: "", done: false, estimate: "30m" },
      { id: "T02", title: "b", description: "", done: false, estimate: "30m" },
    ],
  };

  const groups = groupTasksByFileOverlap(plan);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].taskIds, ["T01"]);
  assert.deepEqual(groups[1].taskIds, ["T02"]);
});

test("done tasks are excluded from groups", () => {
  const plan: SlicePlan = {
    id: "S01", title: "Test", goal: "", demo: "", mustHaves: [],
    filesLikelyTouched: [],
    tasks: [
      { id: "T01", title: "a", description: "", done: true, estimate: "30m", files: ["a.ts"] },
      { id: "T02", title: "b", description: "", done: false, estimate: "30m", files: ["b.ts"] },
    ],
  };

  const groups = groupTasksByFileOverlap(plan);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].taskIds, ["T02"]);
});

// ─── formatSliceEligibilityReport ──────────────────────────────────────────

test("formatSliceEligibilityReport produces readable output", () => {
  const results = [
    { sliceId: "S01", title: "Done", eligible: false, reason: "Already complete." },
    { sliceId: "S02", title: "Ready", eligible: true, reason: "All dependencies satisfied." },
    { sliceId: "S03", title: "Blocked", eligible: false, reason: "Blocked by incomplete dependencies: S02." },
  ];

  const report = formatSliceEligibilityReport("M001", results);
  assert.ok(report.includes("Slice Parallel Eligibility"));
  assert.ok(report.includes("Eligible for Parallel Execution (1)"));
  assert.ok(report.includes("S02"));
  assert.ok(report.includes("Not Eligible (2)"));
});
