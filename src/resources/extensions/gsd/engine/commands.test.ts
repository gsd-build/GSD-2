// GSD Extension — Command Handler Unit Tests
// Tests for all 7 workflow command handlers: completeTask, completeSlice,
// planSlice, saveDecision, startTask, recordVerification, reportBlocker.
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, closeDatabase, _getAdapter } from "../gsd-db.ts";
import type { DbAdapter } from "../gsd-db.ts";
import {
  completeTask,
  completeSlice,
  planSlice,
  saveDecision,
  startTask,
  recordVerification,
  reportBlocker,
} from "../workflow-commands.ts";

/**
 * Helper: seed a test DB with one milestone, one slice, and two tasks.
 */
function seedTestData(db: DbAdapter): void {
  db.prepare(
    `INSERT INTO milestones (id, title, status, created_at)
     VALUES ('M001', 'Test Milestone', 'active', '2026-01-01T00:00:00Z')`,
  ).run();

  db.prepare(
    `INSERT INTO slices (id, milestone_id, title, status, risk, depends_on, created_at, seq)
     VALUES ('S01', 'M001', 'Test Slice', 'active', 'low', '[]', '2026-01-01T00:00:00Z', 1)`,
  ).run();

  db.prepare(
    `INSERT INTO slices (id, milestone_id, title, status, risk, depends_on, created_at, seq)
     VALUES ('S02', 'M001', 'Second Slice', 'pending', 'low', '[]', '2026-01-01T00:00:00Z', 2)`,
  ).run();

  db.prepare(
    `INSERT INTO tasks (id, slice_id, milestone_id, title, description, status, estimate, files, seq)
     VALUES ('T01', 'S01', 'M001', 'First Task', 'Do the first thing', 'pending', '1h', '["a.ts"]', 1)`,
  ).run();

  db.prepare(
    `INSERT INTO tasks (id, slice_id, milestone_id, title, description, status, estimate, files, seq)
     VALUES ('T02', 'S01', 'M001', 'Second Task', 'Do the second thing', 'pending', '2h', '["b.ts"]', 2)`,
  ).run();
}

describe("Command Handlers", () => {
  let db: DbAdapter;

  beforeEach(() => {
    openDatabase(":memory:");
    db = _getAdapter()!;
    seedTestData(db);
  });

  afterEach(() => {
    closeDatabase();
  });

  // ── completeTask ──────────────────────────────────────────────────────

  describe("completeTask", () => {
    it("throws on nonexistent task", () => {
      assert.throws(
        () =>
          completeTask(db, {
            milestoneId: "M001",
            sliceId: "S01",
            taskId: "T99",
            summary: "Done",
          }),
        /Task T99 not found/,
      );
    });

    it("sets status=done, summary, completed_at on existing pending task", () => {
      const result = completeTask(db, {
        milestoneId: "M001",
        sliceId: "S01",
        taskId: "T01",
        summary: "Completed first task",
      });

      assert.strictEqual(result.taskId, "T01");
      assert.strictEqual(result.status, "done");

      const row = db
        .prepare(
          "SELECT status, summary, completed_at FROM tasks WHERE id = 'T01' AND slice_id = 'S01' AND milestone_id = 'M001'",
        )
        .get()!;
      assert.strictEqual(row["status"], "done");
      assert.strictEqual(row["summary"], "Completed first task");
      assert.ok(row["completed_at"], "completed_at should be set");
    });

    it("inserts verification_evidence rows when evidence provided", () => {
      completeTask(db, {
        milestoneId: "M001",
        sliceId: "S01",
        taskId: "T01",
        summary: "Done with evidence",
        evidence: ["npm test passed", "lint clean"],
      });

      const rows = db
        .prepare(
          "SELECT * FROM verification_evidence WHERE task_id = 'T01' AND slice_id = 'S01' AND milestone_id = 'M001'",
        )
        .all();
      assert.strictEqual(rows.length, 2);
    });

    it("is idempotent — calling twice returns same result without error", () => {
      const result1 = completeTask(db, {
        milestoneId: "M001",
        sliceId: "S01",
        taskId: "T01",
        summary: "Done",
      });
      const result2 = completeTask(db, {
        milestoneId: "M001",
        sliceId: "S01",
        taskId: "T01",
        summary: "Done again",
      });

      assert.strictEqual(result1.status, "done");
      assert.strictEqual(result2.status, "done");
      assert.strictEqual(result1.taskId, result2.taskId);
    });

    it("returns rich result with progress context", () => {
      const result = completeTask(db, {
        milestoneId: "M001",
        sliceId: "S01",
        taskId: "T01",
        summary: "Done",
      });

      assert.ok(result.progress.includes("1/2"), `Expected progress to include '1/2', got: ${result.progress}`);
      assert.strictEqual(result.nextTask, "T02");
      assert.strictEqual(result.nextTaskTitle, "Second Task");
    });
  });

  // ── completeSlice ─────────────────────────────────────────────────────

  describe("completeSlice", () => {
    it("throws on nonexistent slice", () => {
      assert.throws(
        () =>
          completeSlice(db, {
            milestoneId: "M001",
            sliceId: "S99",
            summary: "Done",
          }),
        /Slice S99 not found/,
      );
    });

    it("sets status=done, summary, uat_result, completed_at", () => {
      const result = completeSlice(db, {
        milestoneId: "M001",
        sliceId: "S01",
        summary: "Slice complete",
        uatResult: "All tests pass",
      });

      assert.strictEqual(result.sliceId, "S01");
      assert.strictEqual(result.status, "done");

      const row = db
        .prepare(
          "SELECT status, summary, uat_result, completed_at FROM slices WHERE id = 'S01' AND milestone_id = 'M001'",
        )
        .get()!;
      assert.strictEqual(row["status"], "done");
      assert.strictEqual(row["summary"], "Slice complete");
      assert.strictEqual(row["uat_result"], "All tests pass");
      assert.ok(row["completed_at"], "completed_at should be set");
      assert.ok(result.progress.includes("1/2"), `Expected progress '1/2', got: ${result.progress}`);
    });
  });

  // ── planSlice ─────────────────────────────────────────────────────────

  describe("planSlice", () => {
    it("creates multiple task rows with sequential IDs", () => {
      // Use S02 which has no tasks
      const result = planSlice(db, {
        milestoneId: "M001",
        sliceId: "S02",
        tasks: [
          { id: "T01", title: "Task A", description: "Do A", estimate: "1h" },
          { id: "T02", title: "Task B", description: "Do B", files: ["x.ts"], verify: "npm test" },
        ],
      });

      assert.strictEqual(result.sliceId, "S02");
      assert.strictEqual(result.taskCount, 2);
      assert.deepStrictEqual(result.taskIds, ["T01", "T02"]);

      const tasks = db
        .prepare("SELECT * FROM tasks WHERE slice_id = 'S02' AND milestone_id = 'M001' ORDER BY seq")
        .all();
      assert.strictEqual(tasks.length, 2);
      assert.strictEqual(tasks[0]!["seq"], 0);
      assert.strictEqual(tasks[1]!["seq"], 1);
    });

    it("throws when slice already has tasks", () => {
      assert.throws(
        () =>
          planSlice(db, {
            milestoneId: "M001",
            sliceId: "S01",
            tasks: [{ id: "T03", title: "Extra", description: "Nope" }],
          }),
        /Slice S01 already has tasks/,
      );
    });
  });

  // ── saveDecision ──────────────────────────────────────────────────────

  describe("saveDecision", () => {
    it("inserts row into decisions table with auto-generated ID", () => {
      const result = saveDecision(db, {
        scope: "milestone",
        decision: "Use SQLite",
        choice: "SQLite over JSON files",
        rationale: "Atomicity and transactions",
      });

      assert.ok(result.id.startsWith("D"), `Expected ID starting with D, got: ${result.id}`);

      const row = db.prepare("SELECT * FROM decisions WHERE id = ?").get(result.id);
      assert.ok(row, "Decision row should exist");
      assert.strictEqual(row!["scope"], "milestone");
      assert.strictEqual(row!["decision"], "Use SQLite");
    });
  });

  // ── startTask ─────────────────────────────────────────────────────────

  describe("startTask", () => {
    it("sets status=in-progress and started_at timestamp", () => {
      const result = startTask(db, {
        milestoneId: "M001",
        sliceId: "S01",
        taskId: "T01",
      });

      assert.strictEqual(result.taskId, "T01");
      assert.strictEqual(result.status, "in-progress");
      assert.ok(result.startedAt, "startedAt should be set");

      const row = db
        .prepare(
          "SELECT status, started_at FROM tasks WHERE id = 'T01' AND slice_id = 'S01' AND milestone_id = 'M001'",
        )
        .get()!;
      assert.strictEqual(row["status"], "in-progress");
      assert.ok(row["started_at"], "started_at should be set in DB");
    });

    it("throws on already-done task", () => {
      // First complete the task
      db.prepare(
        "UPDATE tasks SET status = 'done', completed_at = '2026-01-01T00:00:00Z' WHERE id = 'T01' AND slice_id = 'S01' AND milestone_id = 'M001'",
      ).run();

      assert.throws(
        () =>
          startTask(db, {
            milestoneId: "M001",
            sliceId: "S01",
            taskId: "T01",
          }),
        /Task T01 is already done/,
      );
    });
  });

  // ── recordVerification ────────────────────────────────────────────────

  describe("recordVerification", () => {
    it("inserts verification_evidence row", () => {
      const result = recordVerification(db, {
        milestoneId: "M001",
        sliceId: "S01",
        taskId: "T01",
        command: "npm test",
        exitCode: 0,
        stdout: "All tests passed",
        stderr: "",
        durationMs: 1234,
      });

      assert.strictEqual(result.taskId, "T01");
      assert.ok(typeof result.evidenceId === "number", "evidenceId should be a number");

      const row = db
        .prepare(
          "SELECT * FROM verification_evidence WHERE task_id = 'T01' AND slice_id = 'S01' AND milestone_id = 'M001'",
        )
        .get()!;
      assert.strictEqual(row["command"], "npm test");
      assert.strictEqual(row["exit_code"], 0);
      assert.strictEqual(row["stdout"], "All tests passed");
      assert.strictEqual(row["duration_ms"], 1234);
    });
  });

  // ── reportBlocker ─────────────────────────────────────────────────────

  describe("reportBlocker", () => {
    it("sets task status=blocked and blocker text", () => {
      const result = reportBlocker(db, {
        milestoneId: "M001",
        sliceId: "S01",
        taskId: "T01",
        description: "Waiting on API key",
      });

      assert.strictEqual(result.taskId, "T01");
      assert.strictEqual(result.status, "blocked");

      const row = db
        .prepare(
          "SELECT status, blocker FROM tasks WHERE id = 'T01' AND slice_id = 'S01' AND milestone_id = 'M001'",
        )
        .get()!;
      assert.strictEqual(row["status"], "blocked");
      assert.strictEqual(row["blocker"], "Waiting on API key");
    });
  });
});
