import test from "node:test";
import assert from "node:assert/strict";
import {
  assignWork,
  stealWork,
  shouldScaleUp,
  shouldScaleDown,
} from "../work-distributor.ts";
import type { WorkQueueItem, WorkerCapacity } from "../types.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeItem(id: string, priority = 1, requirements?: string[]): WorkQueueItem {
  return {
    id, unitType: "execute-task", unitId: `M001/S01/${id}`, prompt: "",
    priority, assignedTo: null, status: "queued",
    enqueuedAt: Date.now(), assignedAt: null, completedAt: null,
    requirements,
  };
}

function makeWorker(id: string, currentLoad = 0, maxLoad = 3, capabilities: string[] = []): WorkerCapacity {
  return {
    workerId: id, currentLoad, maxLoad,
    completedCount: 0, totalCost: 0,
    capabilities, idleSince: null, lastHeartbeat: Date.now(),
  };
}

// ─── Round Robin ──────────────────────────────────────────────────────────

test("round-robin distributes items evenly across workers", () => {
  const items = [makeItem("T01"), makeItem("T02"), makeItem("T03"), makeItem("T04")];
  const workers = [makeWorker("w1"), makeWorker("w2")];

  const assignments = assignWork(items, workers, "round-robin");
  assert.equal(assignments.length, 4);

  const w1Count = assignments.filter(a => a.workerId === "w1").length;
  const w2Count = assignments.filter(a => a.workerId === "w2").length;
  assert.equal(w1Count, 2);
  assert.equal(w2Count, 2);
});

// ─── Least Loaded ─────────────────────────────────────────────────────────

test("least-loaded assigns to worker with fewest in-progress items", () => {
  const items = [makeItem("T01")];
  const workers = [
    makeWorker("w1", 2, 3),  // busy
    makeWorker("w2", 0, 3),  // idle
  ];

  const assignments = assignWork(items, workers, "least-loaded");
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].workerId, "w2");
});

test("least-loaded skips workers at max capacity", () => {
  const items = [makeItem("T01"), makeItem("T02")];
  const workers = [
    makeWorker("w1", 3, 3),  // full
    makeWorker("w2", 1, 3),  // has room
  ];

  const assignments = assignWork(items, workers, "least-loaded");
  assert.equal(assignments.length, 2);
  assert.ok(assignments.every(a => a.workerId === "w2"));
});

// ─── Capability Match ─────────────────────────────────────────────────────

test("capability-match assigns task to worker with matching capabilities", () => {
  const items = [makeItem("T01", 1, ["react", "css"])];
  const workers = [
    makeWorker("w1", 0, 3, ["node", "postgres"]),
    makeWorker("w2", 0, 3, ["react", "css", "tailwind"]),
  ];

  const assignments = assignWork(items, workers, "capability-match");
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].workerId, "w2");
});

test("capability-match falls back to load when no requirements", () => {
  const items = [makeItem("T01", 1, [])];
  const workers = [
    makeWorker("w1", 2, 3),
    makeWorker("w2", 0, 3),
  ];

  const assignments = assignWork(items, workers, "capability-match");
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].workerId, "w2"); // least loaded
});

// ─── Empty Cases ──────────────────────────────────────────────────────────

test("assignWork returns empty for no items", () => {
  assert.deepEqual(assignWork([], [makeWorker("w1")], "least-loaded"), []);
});

test("assignWork returns empty for no workers", () => {
  assert.deepEqual(assignWork([makeItem("T01")], [], "least-loaded"), []);
});

test("assignWork returns empty when all workers full", () => {
  const items = [makeItem("T01")];
  const workers = [makeWorker("w1", 3, 3)];
  assert.deepEqual(assignWork(items, workers, "least-loaded"), []);
});

// ─── Work Stealing ────────────────────────────────────────────────────────

test("stealWork takes item from busiest worker", () => {
  const items: WorkQueueItem[] = [
    { ...makeItem("T01"), assignedTo: "w1", status: "assigned" },
    { ...makeItem("T02"), assignedTo: "w1", status: "assigned" },
    { ...makeItem("T03"), assignedTo: "w2", status: "in-progress" },
  ];
  const workers = [
    makeWorker("w1", 2, 3),
    makeWorker("w2", 1, 3),
    makeWorker("w3", 0, 3),  // idle
  ];

  const stolen = stealWork("w3", items, workers);
  assert.ok(stolen);
  assert.equal(stolen, "T01"); // oldest from busiest
});

test("stealWork returns null when no worker has stealable items", () => {
  const items: WorkQueueItem[] = [
    { ...makeItem("T01"), assignedTo: "w1", status: "in-progress" },
  ];
  const workers = [
    makeWorker("w1", 1, 3), // only 1 item, need >1 to steal
    makeWorker("w2", 0, 3),
  ];

  // w1 has currentLoad=1 which is not >1, so stealWork won't consider it
  const stolen = stealWork("w2", items, workers);
  assert.equal(stolen, null);
});

test("stealWork returns null when all workers have 0-1 items", () => {
  const workers = [
    makeWorker("w1", 1, 3),
    makeWorker("w2", 0, 3),
  ];

  const stolen = stealWork("w2", [], workers);
  assert.equal(stolen, null);
});

// ─── Scaling ──────────────────────────────────────────────────────────────

test("shouldScaleUp returns true when queue depth exceeds threshold", () => {
  assert.equal(shouldScaleUp(5, 2, { max_workers: 4, queue_depth_scale_threshold: 3 }), true);
});

test("shouldScaleUp returns false when at max workers", () => {
  assert.equal(shouldScaleUp(10, 4, { max_workers: 4, queue_depth_scale_threshold: 3 }), false);
});

test("shouldScaleUp returns false when queue depth below threshold", () => {
  assert.equal(shouldScaleUp(2, 1, { max_workers: 4, queue_depth_scale_threshold: 3 }), false);
});

test("shouldScaleDown returns idle workers past timeout", () => {
  const now = Date.now();
  const workers = [
    makeWorker("w1", 1, 3),
    { ...makeWorker("w2", 0, 3), idleSince: now - 60_000 },  // idle 60s
    { ...makeWorker("w3", 0, 3), idleSince: now - 5_000 },   // idle 5s
  ];

  const toRemove = shouldScaleDown(workers, { min_workers: 1, idle_timeout_ms: 30_000 });
  assert.deepEqual(toRemove, ["w2"]); // only w2 past 30s timeout
});

test("shouldScaleDown respects min_workers", () => {
  const now = Date.now();
  const workers = [
    { ...makeWorker("w1", 0, 3), idleSince: now - 60_000 },
    { ...makeWorker("w2", 0, 3), idleSince: now - 60_000 },
  ];

  const toRemove = shouldScaleDown(workers, { min_workers: 2, idle_timeout_ms: 30_000 });
  assert.deepEqual(toRemove, []); // can't go below min
});

test("shouldScaleDown returns empty when no idle workers", () => {
  const workers = [makeWorker("w1", 1, 3), makeWorker("w2", 2, 3)];
  const toRemove = shouldScaleDown(workers, { min_workers: 1, idle_timeout_ms: 30_000 });
  assert.deepEqual(toRemove, []);
});
