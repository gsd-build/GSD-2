// GSD-2 Single-Writer State Architecture — Event replay tests
// Tests for engine.replay() and engine.replayAll() methods.
// Verifies replay dispatches to command handlers, suppresses afterCommand,
// and handles unknown/failing events leniently.
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, closeDatabase, _getAdapter } from "../gsd-db.ts";
import type { DbAdapter } from "../gsd-db.ts";
import { WorkflowEngine } from "../workflow-engine.ts";
import { readEvents } from "../workflow-events.ts";
import type { WorkflowEvent } from "../workflow-events.ts";
import { mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("engine.replay", () => {
  let db: DbAdapter;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "gsd-replay-test-"));
    openDatabase(":memory:");
    db = _getAdapter()!;
    assert.ok(db, "DB adapter must be available");

    // Seed test data: milestone + slice + task
    db.prepare(
      `INSERT INTO milestones (id, title, status, created_at)
       VALUES ('M001', 'Test Milestone', 'active', '2026-01-01T00:00:00Z')`,
    ).run();
    db.prepare(
      `INSERT INTO slices (id, milestone_id, title, status, risk, depends_on, created_at, seq)
       VALUES ('S01', 'M001', 'Test Slice', 'active', 'low', '[]', '2026-01-01T00:00:00Z', 0)`,
    ).run();
    db.prepare(
      `INSERT INTO tasks (id, slice_id, milestone_id, title, description, status, estimate, files, seq)
       VALUES ('T01', 'S01', 'M001', 'Task One', 'Do thing one', 'in-progress', '1h', '[]', 0)`,
    ).run();
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("replays complete_task event", () => {
    const engine = new WorkflowEngine(tempDir);

    const event: WorkflowEvent = {
      cmd: "complete_task",
      params: { milestoneId: "M001", sliceId: "S01", taskId: "T01", summary: "Replayed completion" },
      ts: "2026-01-01T02:00:00Z",
      hash: "abc1234567890abc",
      actor: "agent",
    };

    engine.replay(event);

    // Task should now be done
    const row = db.prepare("SELECT status FROM tasks WHERE id = 'T01'").get() as { status: string };
    assert.equal(row.status, "done");
  });

  it("does not append to event log", () => {
    const engine = new WorkflowEngine(tempDir);

    const event: WorkflowEvent = {
      cmd: "complete_task",
      params: { milestoneId: "M001", sliceId: "S01", taskId: "T01", summary: "Replayed" },
      ts: "2026-01-01T02:00:00Z",
      hash: "abc1234567890abc",
      actor: "agent",
    };

    engine.replay(event);

    // Event log should NOT have been written
    const logPath = join(tempDir, ".gsd", "event-log.jsonl");
    if (existsSync(logPath)) {
      const events = readEvents(logPath);
      assert.equal(events.length, 0, "event log must not have replay entries");
    }
    // If file doesn't exist at all, that's also correct
  });

  it("does not write manifest on replay", () => {
    const engine = new WorkflowEngine(tempDir);
    const manifestPath = join(tempDir, ".gsd", "state-manifest.json");

    const event: WorkflowEvent = {
      cmd: "complete_task",
      params: { milestoneId: "M001", sliceId: "S01", taskId: "T01", summary: "Replayed" },
      ts: "2026-01-01T02:00:00Z",
      hash: "abc1234567890abc",
      actor: "agent",
    };

    engine.replay(event);

    // Manifest should NOT have been written
    assert.ok(!existsSync(manifestPath), "state-manifest.json must not exist after replay");
  });

  it("skips unknown command with warning", () => {
    const engine = new WorkflowEngine(tempDir);

    const event: WorkflowEvent = {
      cmd: "nonexistent_command",
      params: {},
      ts: "2026-01-01T02:00:00Z",
      hash: "abc1234567890abc",
      actor: "agent",
    };

    // Should not throw
    assert.doesNotThrow(() => engine.replay(event));
  });

  it("skips failing command with warning", () => {
    const engine = new WorkflowEngine(tempDir);

    // Try to complete a non-existent task — should not throw
    const event: WorkflowEvent = {
      cmd: "complete_task",
      params: { milestoneId: "M001", sliceId: "S01", taskId: "T_NONEXISTENT", summary: "fail" },
      ts: "2026-01-01T02:00:00Z",
      hash: "abc1234567890abc",
      actor: "agent",
    };

    assert.doesNotThrow(() => engine.replay(event));
  });

  it("replayAll processes events in order", () => {
    // Add a second task
    db.prepare(
      `INSERT INTO tasks (id, slice_id, milestone_id, title, description, status, estimate, files, seq)
       VALUES ('T02', 'S01', 'M001', 'Task Two', 'Do thing two', 'pending', '1h', '[]', 1)`,
    ).run();

    const engine = new WorkflowEngine(tempDir);

    const events: WorkflowEvent[] = [
      {
        cmd: "start_task",
        params: { milestoneId: "M001", sliceId: "S01", taskId: "T01" },
        ts: "2026-01-01T01:00:00Z",
        hash: "aaa0000000000001",
        actor: "agent",
      },
      {
        cmd: "complete_task",
        params: { milestoneId: "M001", sliceId: "S01", taskId: "T01", summary: "Done via replay" },
        ts: "2026-01-01T02:00:00Z",
        hash: "bbb0000000000002",
        actor: "agent",
      },
    ];

    engine.replayAll(events);

    // T01 should be done
    const row = db.prepare("SELECT status FROM tasks WHERE id = 'T01'").get() as { status: string };
    assert.equal(row.status, "done");
  });
});
