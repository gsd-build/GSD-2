import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ParallelIPC } from "../parallel-ipc.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "parallel-ipc-test-"));
}

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function readNdjson(filePath: string): any[] {
  return fs.readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

// ─── init ────────────────────────────────────────────────────────────────────

test("init: creates .gsd/parallel/<batchId>/ directory", () => {
  const root = makeTmpDir();
  const ipc = new ParallelIPC(root, "batch-001");
  ipc.init(3);

  assert.ok(fs.existsSync(path.join(root, ".gsd", "parallel", "batch-001")));
});

test("init: writes batch.json with correct metadata", () => {
  const root = makeTmpDir();
  const ipc = new ParallelIPC(root, "batch-002");
  ipc.init(4);

  const meta = readJson(path.join(root, ".gsd", "parallel", "batch-002", "batch.json"));
  assert.equal(meta.batchId, "batch-002");
  assert.equal(meta.workerCount, 4);
  assert.equal(meta.status, "running");
  assert.ok(typeof meta.startedAt === "number");
});

test("init: appends batch_start event to events.ndjson", () => {
  const root = makeTmpDir();
  const ipc = new ParallelIPC(root, "batch-003");
  ipc.init(2);

  const events = readNdjson(path.join(root, ".gsd", "parallel", "batch-003", "events.ndjson"));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "batch_start");
  assert.equal(events[0].batchId, "batch-003");
  assert.equal(events[0].workerCount, 2);
  assert.ok(typeof events[0].ts === "number");
});

test("init: does not throw when root dir does not exist", () => {
  const nonExistentRoot = path.join(os.tmpdir(), "definitely-does-not-exist-" + Date.now());
  const ipc = new ParallelIPC(nonExistentRoot, "batch-x");
  assert.doesNotThrow(() => ipc.init(1));
});

// ─── workerStart ─────────────────────────────────────────────────────────────

test("workerStart: writes worker-<n>.json with running status", () => {
  const root = makeTmpDir();
  const ipc = new ParallelIPC(root, "batch-w1");
  ipc.init(2);
  ipc.workerStart(0, "gsd-executor", "Implement the feature");

  const meta = readJson(path.join(root, ".gsd", "parallel", "batch-w1", "worker-0.json"));
  assert.equal(meta.index, 0);
  assert.equal(meta.agent, "gsd-executor");
  assert.equal(meta.status, "running");
  assert.ok(meta.taskExcerpt.length > 0);
  assert.ok(typeof meta.startedAt === "number");
});

test("workerStart: truncates task to 120 chars in excerpt", () => {
  const root = makeTmpDir();
  const ipc = new ParallelIPC(root, "batch-w2");
  ipc.init(1);
  const longTask = "x".repeat(200);
  ipc.workerStart(0, "gsd-executor", longTask);

  const meta = readJson(path.join(root, ".gsd", "parallel", "batch-w2", "worker-0.json"));
  assert.ok(meta.taskExcerpt.length <= 123); // 120 + "..."
  assert.ok(meta.taskExcerpt.endsWith("..."));
});

test("workerStart: appends worker_start event to events.ndjson", () => {
  const root = makeTmpDir();
  const ipc = new ParallelIPC(root, "batch-w3");
  ipc.init(1);
  ipc.workerStart(0, "my-agent", "do something");

  const events = readNdjson(path.join(root, ".gsd", "parallel", "batch-w3", "events.ndjson"));
  const startEvent = events.find((e: any) => e.type === "worker_start");
  assert.ok(startEvent);
  assert.equal(startEvent.index, 0);
  assert.equal(startEvent.agent, "my-agent");
});

// ─── workerComplete ───────────────────────────────────────────────────────────

test("workerComplete: updates worker file with completed status and timing", () => {
  const root = makeTmpDir();
  const ipc = new ParallelIPC(root, "batch-c1");
  ipc.init(1);
  ipc.workerStart(0, "gsd-executor", "task");
  ipc.workerComplete(0, "completed", 1234);

  const meta = readJson(path.join(root, ".gsd", "parallel", "batch-c1", "worker-0.json"));
  assert.equal(meta.status, "completed");
  assert.equal(meta.durationMs, 1234);
  assert.ok(typeof meta.completedAt === "number");
});

test("workerComplete: records failed status", () => {
  const root = makeTmpDir();
  const ipc = new ParallelIPC(root, "batch-c2");
  ipc.init(1);
  ipc.workerStart(0, "gsd-executor", "task");
  ipc.workerComplete(0, "failed", 500);

  const meta = readJson(path.join(root, ".gsd", "parallel", "batch-c2", "worker-0.json"));
  assert.equal(meta.status, "failed");
});

test("workerComplete: appends worker_complete event to events.ndjson", () => {
  const root = makeTmpDir();
  const ipc = new ParallelIPC(root, "batch-c3");
  ipc.init(1);
  ipc.workerStart(0, "gsd-executor", "task");
  ipc.workerComplete(0, "completed", 999);

  const events = readNdjson(path.join(root, ".gsd", "parallel", "batch-c3", "events.ndjson"));
  const completeEvent = events.find((e: any) => e.type === "worker_complete");
  assert.ok(completeEvent);
  assert.equal(completeEvent.index, 0);
  assert.equal(completeEvent.status, "completed");
  assert.equal(completeEvent.durationMs, 999);
});

test("workerComplete: does not throw when worker file was never written (init failed)", () => {
  const root = makeTmpDir();
  const ipc = new ParallelIPC(root, "batch-c4");
  ipc.init(1);
  // Intentionally skip workerStart — simulates init failure scenario
  assert.doesNotThrow(() => ipc.workerComplete(0, "failed", 100));
});

// ─── batchComplete ────────────────────────────────────────────────────────────

test("batchComplete: updates batch.json with completed status and counts", () => {
  const root = makeTmpDir();
  const ipc = new ParallelIPC(root, "batch-b1");
  ipc.init(3);
  ipc.batchComplete(2, 1);

  const meta = readJson(path.join(root, ".gsd", "parallel", "batch-b1", "batch.json"));
  assert.equal(meta.status, "completed");
  assert.equal(meta.successCount, 2);
  assert.equal(meta.failedCount, 1);
  assert.ok(typeof meta.durationMs === "number");
});

test("batchComplete: appends batch_complete event to events.ndjson", () => {
  const root = makeTmpDir();
  const ipc = new ParallelIPC(root, "batch-b2");
  ipc.init(2);
  ipc.batchComplete(2, 0);

  const events = readNdjson(path.join(root, ".gsd", "parallel", "batch-b2", "events.ndjson"));
  const completeEvent = events.find((e: any) => e.type === "batch_complete");
  assert.ok(completeEvent);
  assert.equal(completeEvent.successCount, 2);
  assert.equal(completeEvent.failedCount, 0);
  assert.ok(typeof completeEvent.durationMs === "number");
});

// ─── NDJSON integrity ─────────────────────────────────────────────────────────

test("full lifecycle produces valid NDJSON with events in order", () => {
  const root = makeTmpDir();
  const ipc = new ParallelIPC(root, "batch-full");
  ipc.init(2);
  ipc.workerStart(0, "agent-a", "task a");
  ipc.workerStart(1, "agent-b", "task b");
  ipc.workerComplete(0, "completed", 100);
  ipc.workerComplete(1, "failed", 200);
  ipc.batchComplete(1, 1);

  const events = readNdjson(path.join(root, ".gsd", "parallel", "batch-full", "events.ndjson"));
  const types = events.map((e: any) => e.type);
  assert.deepEqual(types, [
    "batch_start",
    "worker_start",
    "worker_start",
    "worker_complete",
    "worker_complete",
    "batch_complete",
  ]);
});

// ─── accessors ───────────────────────────────────────────────────────────────

test("eventsFilePath points to events.ndjson inside batch dir", () => {
  const root = makeTmpDir();
  const ipc = new ParallelIPC(root, "batch-acc");
  assert.ok(ipc.eventsFilePath.endsWith(path.join("batch-acc", "events.ndjson")));
});

test("batchDirPath points to the batch directory", () => {
  const root = makeTmpDir();
  const ipc = new ParallelIPC(root, "batch-dir");
  assert.ok(ipc.batchDirPath.endsWith(path.join("parallel", "batch-dir")));
});
