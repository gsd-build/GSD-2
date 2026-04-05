// GSD-FSM Extension — State Extractor Tests

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir, cleanup } from "../../gsd/tests/test-utils.ts";
import {
  extractFSMSnapshot,
  getGSDPhases,
  getGSDTransitions,
  buildEventTimeline,
  detectAnomalies,
} from "../state-extractor.ts";
import type { GSDState } from "../../gsd/types.ts";

function makeState(overrides: Partial<GSDState> = {}): GSDState {
  return {
    phase: "executing",
    activeMilestone: { id: "M001", title: "Test Milestone" },
    activeSlice: { id: "S01", title: "Test Slice" },
    activeTask: { id: "T01", title: "Test Task" },
    recentDecisions: [],
    blockers: [],
    nextAction: "execute-task",
    registry: [
      { id: "M001", title: "Test Milestone", status: "active" },
      { id: "M002", title: "Next Milestone", status: "pending" },
    ],
    progress: {
      milestones: { done: 0, total: 2 },
      slices: { done: 1, total: 3 },
      tasks: { done: 2, total: 5 },
    },
    ...overrides,
  };
}

describe("state-extractor", () => {
  describe("getGSDPhases", () => {
    test("returns all known GSD phases", () => {
      const phases = getGSDPhases();
      assert.ok(phases.includes("pre-planning"));
      assert.ok(phases.includes("executing"));
      assert.ok(phases.includes("complete"));
      assert.ok(phases.includes("blocked"));
      assert.ok(phases.length >= 14);
    });

    test("returns a copy (not mutable reference)", () => {
      const a = getGSDPhases();
      const b = getGSDPhases();
      a.push("fake" as any);
      assert.ok(!b.includes("fake" as any));
    });
  });

  describe("getGSDTransitions", () => {
    test("returns known transitions", () => {
      const transitions = getGSDTransitions();
      assert.ok(transitions.length > 0);

      const preToDiscuss = transitions.find(
        (t) => t.from === "pre-planning" && t.to === "needs-discussion",
      );
      assert.ok(preToDiscuss, "pre-planning → needs-discussion should exist");

      const execToSumm = transitions.find(
        (t) => t.from === "executing" && t.to === "summarizing",
      );
      assert.ok(execToSumm, "executing → summarizing should exist");
    });
  });

  describe("extractFSMSnapshot", () => {
    test("extracts current phase and active refs", () => {
      const state = makeState();
      const snapshot = extractFSMSnapshot(state);

      assert.equal(snapshot.currentPhase, "executing");
      assert.equal(snapshot.activeMilestone, "M001");
      assert.equal(snapshot.activeSlice, "S01");
      assert.equal(snapshot.activeTask, "T01");
    });

    test("handles null active refs", () => {
      const state = makeState({
        activeMilestone: null,
        activeSlice: null,
        activeTask: null,
        phase: "complete",
      });
      const snapshot = extractFSMSnapshot(state);

      assert.equal(snapshot.activeMilestone, null);
      assert.equal(snapshot.activeSlice, null);
      assert.equal(snapshot.activeTask, null);
    });

    test("includes milestone registry", () => {
      const state = makeState();
      const snapshot = extractFSMSnapshot(state);

      assert.equal(snapshot.milestones.length, 2);
      assert.equal(snapshot.milestones[0].id, "M001");
      assert.equal(snapshot.milestones[1].status, "pending");
    });

    test("includes progress counters", () => {
      const state = makeState();
      const snapshot = extractFSMSnapshot(state);

      assert.equal(snapshot.progress?.milestones.done, 0);
      assert.equal(snapshot.progress?.milestones.total, 2);
      assert.equal(snapshot.progress?.tasks?.done, 2);
    });

    test("includes blockers", () => {
      const state = makeState({ blockers: ["Missing API key", "CI failing"] });
      const snapshot = extractFSMSnapshot(state);

      assert.equal(snapshot.blockers.length, 2);
      assert.ok(snapshot.blockers.includes("Missing API key"));
    });
  });

  describe("buildEventTimeline", () => {
    let dir: string;

    beforeEach(() => {
      dir = makeTempDir("fsm-timeline-");
    });

    afterEach(() => {
      cleanup(dir);
    });

    test("returns empty array when no event log exists", () => {
      const timeline = buildEventTimeline(dir);
      assert.deepEqual(timeline, []);
    });

    test("parses events from JSONL file", () => {
      const gsdDir = join(dir, ".gsd");
      mkdirSync(gsdDir, { recursive: true });
      const events = [
        { cmd: "plan_milestone", params: { milestoneId: "M001" }, ts: "2026-03-30T10:00:00.000Z", hash: "abc123", actor: "agent", session_id: "sess-1" },
        { cmd: "execute_task", params: { milestoneId: "M001", sliceId: "S01", taskId: "T01" }, ts: "2026-03-30T10:05:00.000Z", hash: "def456", actor: "agent", session_id: "sess-1" },
      ];
      writeFileSync(join(gsdDir, "event-log.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");

      const timeline = buildEventTimeline(dir);
      assert.equal(timeline.length, 2);
      assert.equal(timeline[0].cmd, "plan_milestone");
      assert.equal(timeline[1].cmd, "execute_task");
      assert.equal(timeline[1].milestoneId, "M001");
      assert.equal(timeline[1].taskId, "T01");
    });

    test("calculates dwell time between events", () => {
      const gsdDir = join(dir, ".gsd");
      mkdirSync(gsdDir, { recursive: true });
      const events = [
        { cmd: "a", params: {}, ts: "2026-03-30T10:00:00.000Z", hash: "a", actor: "agent", session_id: "s1" },
        { cmd: "b", params: {}, ts: "2026-03-30T10:05:00.000Z", hash: "b", actor: "agent", session_id: "s1" },
      ];
      writeFileSync(join(gsdDir, "event-log.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");

      const timeline = buildEventTimeline(dir);
      assert.equal(timeline[0].dwellMs, undefined);
      assert.equal(timeline[1].dwellMs, 300_000); // 5 minutes
    });

    test("filters by milestoneId", () => {
      const gsdDir = join(dir, ".gsd");
      mkdirSync(gsdDir, { recursive: true });
      const events = [
        { cmd: "a", params: { milestoneId: "M001" }, ts: "2026-03-30T10:00:00.000Z", hash: "a", actor: "agent", session_id: "s1" },
        { cmd: "b", params: { milestoneId: "M002" }, ts: "2026-03-30T10:01:00.000Z", hash: "b", actor: "agent", session_id: "s1" },
        { cmd: "c", params: { milestoneId: "M001" }, ts: "2026-03-30T10:02:00.000Z", hash: "c", actor: "agent", session_id: "s1" },
      ];
      writeFileSync(join(gsdDir, "event-log.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");

      const timeline = buildEventTimeline(dir, { milestoneId: "M001" });
      assert.equal(timeline.length, 2);
      assert.equal(timeline[0].cmd, "a");
      assert.equal(timeline[1].cmd, "c");
    });

    test("respects limit (takes most recent)", () => {
      const gsdDir = join(dir, ".gsd");
      mkdirSync(gsdDir, { recursive: true });
      const events = Array.from({ length: 10 }, (_, i) => ({
        cmd: `cmd_${i}`, params: {}, ts: `2026-03-30T10:${String(i).padStart(2, "0")}:00.000Z`, hash: String(i), actor: "agent", session_id: "s1",
      }));
      writeFileSync(join(gsdDir, "event-log.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");

      const timeline = buildEventTimeline(dir, { limit: 3 });
      assert.equal(timeline.length, 3);
      assert.equal(timeline[0].cmd, "cmd_7");
    });
  });

  describe("detectAnomalies", () => {
    test("detects long dwell times", () => {
      const timeline = [
        { ts: "2026-03-30T10:00:00.000Z", cmd: "a", sessionId: "s1" },
        { ts: "2026-03-30T10:10:00.000Z", cmd: "b", sessionId: "s1", dwellMs: 600_000 },
      ];
      const anomalies = detectAnomalies(timeline);
      assert.ok(anomalies.some((a) => a.includes("Long dwell")));
    });

    test("does not flag normal dwell times", () => {
      const timeline = [
        { ts: "2026-03-30T10:00:00.000Z", cmd: "a", sessionId: "s1" },
        { ts: "2026-03-30T10:01:00.000Z", cmd: "b", sessionId: "s1", dwellMs: 60_000 },
      ];
      const anomalies = detectAnomalies(timeline);
      assert.equal(anomalies.filter((a) => a.includes("Long dwell")).length, 0);
    });

    test("detects replan loops", () => {
      const timeline = [
        { ts: "t1", cmd: "replan_slice", sliceId: "S01", milestoneId: "M001", sessionId: "s1" },
        { ts: "t2", cmd: "execute_task", sessionId: "s1" },
        { ts: "t3", cmd: "replan_slice", sliceId: "S01", milestoneId: "M001", sessionId: "s1" },
      ];
      const anomalies = detectAnomalies(timeline);
      assert.ok(anomalies.some((a) => a.includes("Replan loop")));
    });

    test("returns empty for clean timeline", () => {
      const timeline = [
        { ts: "t1", cmd: "plan", sessionId: "s1" },
        { ts: "t2", cmd: "execute", sessionId: "s1", dwellMs: 30_000 },
        { ts: "t3", cmd: "complete", sessionId: "s1", dwellMs: 20_000 },
      ];
      const anomalies = detectAnomalies(timeline);
      assert.equal(anomalies.length, 0);
    });
  });
});
