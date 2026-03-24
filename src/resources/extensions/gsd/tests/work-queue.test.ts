import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  enqueue,
  dequeue,
  complete,
  markInProgress,
  reassign,
  getQueueDepth,
  getQueueItems,
  getWorkerItems,
  pruneCompleted,
} from "../work-queue.ts";

// ─── Enqueue / Dequeue ────────────────────────────────────────────────────

test("enqueue and dequeue roundtrip", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-wq-basic-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    const item = enqueue(base, {
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      prompt: "Execute task T01",
      priority: 1,
    });

    assert.ok(item.id);
    assert.equal(item.status, "queued");
    assert.equal(getQueueDepth(base), 1);

    const dequeued = dequeue(base, "worker-1");
    assert.ok(dequeued);
    assert.equal(dequeued.id, item.id);
    assert.equal(dequeued.status, "assigned");
    assert.equal(dequeued.assignedTo, "worker-1");

    assert.equal(getQueueDepth(base), 0);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("dequeue returns highest priority item first", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-wq-priority-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    enqueue(base, { unitType: "t", unitId: "low", prompt: "", priority: 10 });
    enqueue(base, { unitType: "t", unitId: "high", prompt: "", priority: 1 });
    enqueue(base, { unitType: "t", unitId: "mid", prompt: "", priority: 5 });

    const first = dequeue(base, "w1");
    assert.ok(first);
    assert.equal(first.unitId, "high");

    const second = dequeue(base, "w1");
    assert.ok(second);
    assert.equal(second.unitId, "mid");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("dequeue returns null when queue is empty", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-wq-empty-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });
    assert.equal(dequeue(base, "w1"), null);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("dequeue with capabilities filter", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-wq-caps-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    enqueue(base, {
      unitType: "t", unitId: "react-task", prompt: "", priority: 1,
      requirements: ["react", "css"],
    });
    enqueue(base, {
      unitType: "t", unitId: "sql-task", prompt: "", priority: 1,
      requirements: ["postgres"],
    });

    // Worker with react capability gets the react task
    const result = dequeue(base, "w1", ["react", "css"]);
    assert.ok(result);
    assert.equal(result.unitId, "react-task");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ─── Complete ─────────────────────────────────────────────────────────────

test("complete marks item as completed", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-wq-complete-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    const item = enqueue(base, { unitType: "t", unitId: "a", prompt: "", priority: 1 });
    dequeue(base, "w1");
    complete(base, item.id, true);

    const items = getQueueItems(base, "completed");
    assert.equal(items.length, 1);
    assert.ok(items[0].completedAt);

    // Completed items are not dequeued again
    assert.equal(dequeue(base, "w2"), null);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("complete marks item as failed", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-wq-fail-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    const item = enqueue(base, { unitType: "t", unitId: "a", prompt: "", priority: 1 });
    dequeue(base, "w1");
    complete(base, item.id, false);

    const items = getQueueItems(base, "failed");
    assert.equal(items.length, 1);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ─── Reassign (Work Stealing) ─────────────────────────────────────────────

test("reassign moves item to new worker", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-wq-reassign-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    const item = enqueue(base, { unitType: "t", unitId: "a", prompt: "", priority: 1 });
    dequeue(base, "w1");

    const success = reassign(base, item.id, "w2");
    assert.equal(success, true);

    const items = getWorkerItems(base, "w2");
    assert.equal(items.length, 1);
    assert.equal(items[0].assignedTo, "w2");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("reassign fails for completed items", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-wq-reassign-done-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    const item = enqueue(base, { unitType: "t", unitId: "a", prompt: "", priority: 1 });
    dequeue(base, "w1");
    complete(base, item.id, true);

    assert.equal(reassign(base, item.id, "w2"), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ─── Queue Management ─────────────────────────────────────────────────────

test("getQueueItems returns all items without filter", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-wq-all-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    enqueue(base, { unitType: "t", unitId: "a", prompt: "", priority: 1 });
    enqueue(base, { unitType: "t", unitId: "b", prompt: "", priority: 2 });
    dequeue(base, "w1");

    const all = getQueueItems(base);
    assert.equal(all.length, 2);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("pruneCompleted removes finished items", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-wq-prune-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    const item1 = enqueue(base, { unitType: "t", unitId: "a", prompt: "", priority: 1 });
    enqueue(base, { unitType: "t", unitId: "b", prompt: "", priority: 2 });
    dequeue(base, "w1");
    complete(base, item1.id, true);

    const removed = pruneCompleted(base);
    assert.equal(removed, 1);
    assert.equal(getQueueItems(base).length, 1);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
