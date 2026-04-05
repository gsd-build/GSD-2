// GSD-FSM Extension — Diagram Builder Tests

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPhaseDiagram,
  buildMilestoneDiagram,
  buildStatusSummary,
} from "../diagram-builder.ts";
import type { GSDFSMSnapshot } from "../state-extractor.ts";

function makeSnapshot(overrides: Partial<GSDFSMSnapshot> = {}): GSDFSMSnapshot {
  return {
    states: ["pre-planning", "planning", "executing", "summarizing", "complete", "blocked"],
    transitions: [
      { from: "pre-planning", to: "planning", event: "CONTEXT_ready" },
      { from: "planning", to: "executing", event: "PLAN_ready" },
      { from: "executing", to: "summarizing", event: "all_tasks_complete" },
      { from: "summarizing", to: "complete", event: "SUMMARY_written" },
      { from: "planning", to: "blocked", event: "deps_unmet" },
    ],
    currentPhase: "executing",
    milestones: [
      { id: "M001", title: "First Milestone", status: "active" },
      { id: "M002", title: "Second Milestone", status: "pending" },
    ],
    activeMilestone: "M001",
    activeSlice: "S01",
    activeTask: "T02",
    progress: {
      milestones: { done: 0, total: 2 },
      slices: { done: 1, total: 3 },
      tasks: { done: 3, total: 8 },
    },
    blockers: [],
    ...overrides,
  };
}

describe("diagram-builder", () => {
  describe("buildPhaseDiagram", () => {
    test("generates valid Mermaid stateDiagram-v2", () => {
      const snapshot = makeSnapshot();
      const diagram = buildPhaseDiagram(snapshot);

      assert.ok(diagram.includes("```mermaid"));
      assert.ok(diagram.includes("stateDiagram-v2"));
      assert.ok(diagram.includes("```"));
    });

    test("includes title when provided", () => {
      const diagram = buildPhaseDiagram(makeSnapshot(), { title: "My FSM" });
      assert.ok(diagram.includes("title: My FSM"));
    });

    test("includes direction", () => {
      const diagram = buildPhaseDiagram(makeSnapshot(), { direction: "LR" });
      assert.ok(diagram.includes("direction LR"));
    });

    test("defaults to TB direction", () => {
      const diagram = buildPhaseDiagram(makeSnapshot());
      assert.ok(diagram.includes("direction TB"));
    });

    test("highlights current phase with active class", () => {
      const diagram = buildPhaseDiagram(makeSnapshot({ currentPhase: "executing" }));
      assert.ok(diagram.includes("classDef active"));
      assert.ok(diagram.includes("class executing active"));
    });

    test("includes start and end markers", () => {
      const diagram = buildPhaseDiagram(makeSnapshot());
      assert.ok(diagram.includes("[*] --> pre_planning"));
      assert.ok(diagram.includes("complete --> [*]"));
    });

    test("renders transitions with events", () => {
      const diagram = buildPhaseDiagram(makeSnapshot());
      assert.ok(diagram.includes("pre_planning --> planning : CONTEXT_ready"));
      assert.ok(diagram.includes("executing --> summarizing : all_tasks_complete"));
    });

    test("sanitizes phase names with hyphens", () => {
      const diagram = buildPhaseDiagram(makeSnapshot());
      assert.ok(diagram.includes("pre_planning"));
      assert.ok(!diagram.includes("pre-planning -->"));
    });

    test("skips highlight when disabled", () => {
      const diagram = buildPhaseDiagram(makeSnapshot(), { highlightCurrent: false });
      assert.ok(!diagram.includes("classDef active"));
    });
  });

  describe("buildMilestoneDiagram", () => {
    test("generates milestone state diagram", () => {
      const milestones = [
        { id: "M001", title: "First", status: "complete" as const },
        { id: "M002", title: "Second", status: "active" as const },
        { id: "M003", title: "Third", status: "pending" as const },
      ];
      const diagram = buildMilestoneDiagram(milestones, "M002");

      assert.ok(diagram.includes("```mermaid"));
      assert.ok(diagram.includes("M001"));
      assert.ok(diagram.includes("M002"));
      assert.ok(diagram.includes("class M002 active"));
      assert.ok(diagram.includes("class M001 complete"));
      assert.ok(diagram.includes("class M003 pending"));
    });

    test("returns message when no milestones", () => {
      const diagram = buildMilestoneDiagram([], null);
      assert.equal(diagram, "No milestones found.");
    });

    test("renders dependency edges", () => {
      const milestones = [
        { id: "M001", title: "First", status: "complete" as const },
        { id: "M002", title: "Second", status: "active" as const, dependsOn: ["M001"] },
      ];
      const diagram = buildMilestoneDiagram(milestones, "M002");
      assert.ok(diagram.includes("M001 --> M002 : depends"));
    });

    test("styles parked milestones", () => {
      const milestones = [
        { id: "M001", title: "Parked", status: "parked" as const },
      ];
      const diagram = buildMilestoneDiagram(milestones, null);
      assert.ok(diagram.includes("class M001 parked"));
    });
  });

  describe("buildStatusSummary", () => {
    test("includes phase and active refs", () => {
      const summary = buildStatusSummary(makeSnapshot());
      assert.ok(summary.includes("**Phase:** Executing"));
      assert.ok(summary.includes("**Active Milestone:** M001"));
      assert.ok(summary.includes("**Active Slice:** S01"));
      assert.ok(summary.includes("**Active Task:** T02"));
    });

    test("includes progress counters", () => {
      const summary = buildStatusSummary(makeSnapshot());
      assert.ok(summary.includes("Milestones: 0/2"));
      assert.ok(summary.includes("Slices: 1/3"));
      assert.ok(summary.includes("Tasks: 3/8"));
    });

    test("includes blockers when present", () => {
      const summary = buildStatusSummary(makeSnapshot({ blockers: ["CI is broken"] }));
      assert.ok(summary.includes("### Blockers"));
      assert.ok(summary.includes("CI is broken"));
    });

    test("omits blockers section when empty", () => {
      const summary = buildStatusSummary(makeSnapshot({ blockers: [] }));
      assert.ok(!summary.includes("### Blockers"));
    });

    test("includes milestone registry", () => {
      const summary = buildStatusSummary(makeSnapshot());
      assert.ok(summary.includes("**M001** First Milestone (active)"));
      assert.ok(summary.includes("**M002** Second Milestone (pending)"));
    });

    test("handles null active refs gracefully", () => {
      const summary = buildStatusSummary(makeSnapshot({
        activeMilestone: null,
        activeSlice: null,
        activeTask: null,
      }));
      assert.ok(!summary.includes("**Active Milestone:**"));
      assert.ok(!summary.includes("**Active Slice:**"));
      assert.ok(!summary.includes("**Active Task:**"));
    });
  });
});
