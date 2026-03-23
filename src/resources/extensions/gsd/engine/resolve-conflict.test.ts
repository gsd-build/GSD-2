// GSD Extension — Conflict Resolution Unit Tests
// Tests for resolveConflict, listConflicts, removeConflictsFile in workflow-reconcile.ts.
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, closeDatabase, _getAdapter } from "../gsd-db.ts";
import type { DbAdapter } from "../gsd-db.ts";
import { readEvents } from "../workflow-events.ts";
import type { WorkflowEvent } from "../workflow-events.ts";
import { mkdtempSync, existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeConflictsFile } from "../workflow-reconcile.ts";
import type { ConflictEntry } from "../workflow-reconcile.ts";
import { resolveConflict, listConflicts, removeConflictsFile } from "../workflow-reconcile.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(
  cmd: string,
  params: Record<string, unknown>,
  ts: string,
  hash: string,
): WorkflowEvent {
  return { cmd, params, ts, hash, actor: "agent" };
}

function writeEventLog(basePath: string, events: WorkflowEvent[]): void {
  const dir = join(basePath, ".gsd");
  mkdirSync(dir, { recursive: true });
  const lines = events.map((e) => JSON.stringify(e)).join("\n");
  writeFileSync(join(dir, "event-log.jsonl"), lines + (lines.length > 0 ? "\n" : ""), "utf-8");
}

function seedDb(db: DbAdapter): void {
  db.exec(`CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT DEFAULT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS slices (
    id TEXT PRIMARY KEY, milestone_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
    risk TEXT NOT NULL DEFAULT 'low', depends_on TEXT NOT NULL DEFAULT '[]',
    summary TEXT DEFAULT NULL, uat_result TEXT DEFAULT NULL, created_at TEXT NOT NULL,
    completed_at TEXT DEFAULT NULL, seq INTEGER NOT NULL DEFAULT 0
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, slice_id TEXT NOT NULL, milestone_id TEXT NOT NULL, title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
    estimate TEXT NOT NULL DEFAULT '1h', summary TEXT DEFAULT NULL, files TEXT NOT NULL DEFAULT '[]',
    verify TEXT DEFAULT NULL, started_at TEXT DEFAULT NULL, completed_at TEXT DEFAULT NULL,
    blocker TEXT DEFAULT NULL, seq INTEGER NOT NULL DEFAULT 0
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS decisions (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
    when_context TEXT NOT NULL DEFAULT '', scope TEXT NOT NULL DEFAULT '',
    decision TEXT NOT NULL DEFAULT '', choice TEXT NOT NULL DEFAULT '',
    rationale TEXT NOT NULL DEFAULT '', revisable TEXT NOT NULL DEFAULT '',
    made_by TEXT NOT NULL DEFAULT 'agent', superseded_by TEXT DEFAULT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS verification_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, slice_id TEXT NOT NULL,
    milestone_id TEXT NOT NULL, command TEXT NOT NULL, exit_code INTEGER DEFAULT NULL,
    stdout TEXT NOT NULL DEFAULT '', stderr TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER DEFAULT NULL, recorded_at TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL, applied_at TEXT NOT NULL)`);

  db.prepare(`INSERT INTO milestones (id, title, status, created_at) VALUES ('M001', 'Test Milestone', 'active', '2026-01-01T00:00:00Z')`).run();
  db.prepare(`INSERT INTO slices (id, milestone_id, title, status, risk, depends_on, created_at, seq)
    VALUES ('S01', 'M001', 'Test Slice', 'active', 'low', '[]', '2026-01-01T00:00:00Z', 0)`).run();
  db.prepare(`INSERT INTO tasks (id, slice_id, milestone_id, title, description, status, estimate, files, seq)
    VALUES ('T01', 'S01', 'M001', 'Task One', 'Do thing one', 'in-progress', '1h', '[]', 0)`).run();
  db.prepare(`INSERT INTO tasks (id, slice_id, milestone_id, title, description, status, estimate, files, seq)
    VALUES ('T02', 'S01', 'M001', 'Task Two', 'Do thing two', 'pending', '1h', '[]', 1)`).run();
}

// ─── Conflict fixtures ─────────────────────────────────────────────────────

const MAIN_EVENT_T01 = makeEvent(
  "complete_task",
  { milestoneId: "M001", sliceId: "S01", taskId: "T01", summary: "Main version" },
  "2026-01-01T01:00:00Z",
  "aaaa000000000001",
);

const WT_EVENT_T01 = makeEvent(
  "complete_task",
  { milestoneId: "M001", sliceId: "S01", taskId: "T01", summary: "WT version" },
  "2026-01-01T01:30:00Z",
  "bbbb000000000001",
);

const MAIN_EVENT_T02 = makeEvent(
  "complete_task",
  { milestoneId: "M001", sliceId: "S01", taskId: "T02", summary: "Main T02" },
  "2026-01-01T02:00:00Z",
  "cccc000000000001",
);

const CONFLICT_T01: ConflictEntry = {
  entityType: "task",
  entityId: "T01",
  mainSideEvents: [MAIN_EVENT_T01],
  worktreeSideEvents: [WT_EVENT_T01],
};

const CONFLICT_T02: ConflictEntry = {
  entityType: "task",
  entityId: "T02",
  mainSideEvents: [MAIN_EVENT_T02],
  worktreeSideEvents: [makeEvent("complete_task", { milestoneId: "M001", sliceId: "S01", taskId: "T02", summary: "WT T02" }, "2026-01-01T02:30:00Z", "dddd000000000001")],
};

// ─── Test Suites ──────────────────────────────────────────────────────────────

describe("listConflicts", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "gsd-resolve-test-"));
    mkdirSync(join(baseDir, ".gsd"), { recursive: true });
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  // Test 1: listConflicts returns parsed ConflictEntry[] from CONFLICTS.md
  it("Test 1: listConflicts returns parsed ConflictEntry[] from CONFLICTS.md", () => {
    writeConflictsFile(baseDir, [CONFLICT_T01], "/some/worktree");

    const conflicts = listConflicts(baseDir);

    assert.equal(conflicts.length, 1, "should return one conflict");
    assert.equal(conflicts[0]!.entityType, "task", "entityType should be task");
    assert.equal(conflicts[0]!.entityId, "T01", "entityId should be T01");
    assert.equal(conflicts[0]!.mainSideEvents.length, 1, "should have 1 main event");
    assert.equal(conflicts[0]!.worktreeSideEvents.length, 1, "should have 1 worktree event");
    assert.equal(conflicts[0]!.mainSideEvents[0]!.cmd, "complete_task", "main event cmd should match");
    assert.equal(conflicts[0]!.worktreeSideEvents[0]!.cmd, "complete_task", "wt event cmd should match");
  });

  // Test 2: listConflicts returns empty array when no CONFLICTS.md exists
  it("Test 2: listConflicts returns empty array when no CONFLICTS.md exists", () => {
    const conflicts = listConflicts(baseDir);
    assert.deepEqual(conflicts, [], "should return empty array when no CONFLICTS.md");
  });
});

describe("resolveConflict", () => {
  let baseDir: string;
  let db: DbAdapter;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "gsd-resolve-test-"));
    mkdirSync(join(baseDir, ".gsd"), { recursive: true });

    openDatabase(":memory:");
    db = _getAdapter()!;
    assert.ok(db, "DB adapter must be available");
    seedDb(db);

    // Write a base event log so engine has context
    writeEventLog(baseDir, [
      makeEvent("start_task", { milestoneId: "M001", sliceId: "S01", taskId: "T01" }, "2026-01-01T00:00:00Z", "base0000000001"),
    ]);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(baseDir, { recursive: true, force: true });
  });

  // Test 3: resolveConflict with pick="main" replays main side events, discards worktree side
  it("Test 3: resolveConflict with pick='main' replays main side events for the entity", () => {
    writeConflictsFile(baseDir, [CONFLICT_T01], "/some/worktree");

    resolveConflict(baseDir, "task:T01", "main");

    // CONFLICTS.md should be removed (was the only conflict)
    const conflictsPath = join(baseDir, ".gsd", "CONFLICTS.md");
    assert.ok(!existsSync(conflictsPath), "CONFLICTS.md should be removed after resolving last conflict");
  });

  // Test 4: resolveConflict with pick="worktree" replays worktree side events, discards main side
  it("Test 4: resolveConflict with pick='worktree' replays worktree side events", () => {
    writeConflictsFile(baseDir, [CONFLICT_T01], "/some/worktree");

    resolveConflict(baseDir, "task:T01", "worktree");

    // CONFLICTS.md should be removed
    assert.ok(!existsSync(join(baseDir, ".gsd", "CONFLICTS.md")), "CONFLICTS.md removed after resolve");
  });

  // Test 5: resolveConflict updates CONFLICTS.md removing the resolved entry (partial resolution)
  it("Test 5: resolveConflict updates CONFLICTS.md removing the resolved entry (partial resolution)", () => {
    writeConflictsFile(baseDir, [CONFLICT_T01, CONFLICT_T02], "/some/worktree");

    // Also seed T02 data
    db.prepare(`INSERT OR REPLACE INTO tasks (id, slice_id, milestone_id, title, description, status, estimate, files, seq)
      VALUES ('T02', 'S01', 'M001', 'Task Two', 'Do thing two', 'in-progress', '1h', '[]', 1)`).run();

    resolveConflict(baseDir, "task:T01", "main");

    // CONFLICTS.md should still exist (T02 conflict remains)
    const conflictsPath = join(baseDir, ".gsd", "CONFLICTS.md");
    assert.ok(existsSync(conflictsPath), "CONFLICTS.md should still exist with remaining conflicts");

    // Remaining conflicts should only have T02
    const remaining = listConflicts(baseDir);
    assert.equal(remaining.length, 1, "should have 1 remaining conflict");
    assert.equal(remaining[0]!.entityId, "T02", "remaining conflict should be T02");
  });

  // Test 6: resolveConflict removes CONFLICTS.md entirely when last conflict is resolved
  it("Test 6: resolveConflict removes CONFLICTS.md entirely when last conflict is resolved", () => {
    writeConflictsFile(baseDir, [CONFLICT_T01], "/some/worktree");

    resolveConflict(baseDir, "task:T01", "main");

    assert.ok(!existsSync(join(baseDir, ".gsd", "CONFLICTS.md")), "CONFLICTS.md removed when all conflicts resolved");
  });

  // Test 7: resolveConflict throws when entity not found in CONFLICTS.md
  it("Test 7: resolveConflict throws when entity not found in CONFLICTS.md", () => {
    writeConflictsFile(baseDir, [CONFLICT_T01], "/some/worktree");

    assert.throws(
      () => resolveConflict(baseDir, "task:T99", "main"),
      /No conflict found for entity task:T99/,
      "should throw when entity not found in CONFLICTS.md",
    );
  });

  // Test 8: After resolving all conflicts, the event log contains the resolved events appended
  it("Test 8: After resolving all conflicts, event log contains resolved events appended", () => {
    writeConflictsFile(baseDir, [CONFLICT_T01], "/some/worktree");

    const logPath = join(baseDir, ".gsd", "event-log.jsonl");
    const eventsBefore = readEvents(logPath);
    const countBefore = eventsBefore.length;

    resolveConflict(baseDir, "task:T01", "main");

    const eventsAfter = readEvents(logPath);
    assert.ok(eventsAfter.length > countBefore, "event log should have more events after resolution");

    // The resolved main-side events should be in the log
    const appendedCmds = eventsAfter.slice(countBefore).map((e) => e.cmd);
    assert.ok(appendedCmds.includes("complete_task"), "resolved event (complete_task) should be appended to log");
  });
});

describe("removeConflictsFile", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "gsd-remove-conflicts-test-"));
    mkdirSync(join(baseDir, ".gsd"), { recursive: true });
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("removes CONFLICTS.md when it exists", () => {
    writeConflictsFile(baseDir, [CONFLICT_T01], "/some/worktree");
    assert.ok(existsSync(join(baseDir, ".gsd", "CONFLICTS.md")), "CONFLICTS.md should exist before removal");

    removeConflictsFile(baseDir);

    assert.ok(!existsSync(join(baseDir, ".gsd", "CONFLICTS.md")), "CONFLICTS.md should be removed");
  });

  it("does not throw when CONFLICTS.md does not exist", () => {
    assert.doesNotThrow(() => removeConflictsFile(baseDir), "should not throw when no CONFLICTS.md");
  });
});
