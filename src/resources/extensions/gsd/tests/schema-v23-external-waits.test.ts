/**
 * Schema v23 migration test: external_waits table.
 *
 * Verifies:
 * 1. Fresh DB creation includes the external_waits table with correct columns
 * 2. The poll_while_command column exists (renamed from check_command)
 * 3. A pre-v23 DB (stamped at v22) successfully migrates to v23
 * 4. Index idx_external_waits_milestone_status exists
 */

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  openDatabase,
  closeDatabase,
  _getAdapter,
} from "../gsd-db.ts";

let tmpDir: string;

afterEach(() => {
  try { closeDatabase(); } catch { /* may not be open */ }
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = "";
  }
});

describe("Schema v23: external_waits table", () => {
  test("fresh DB has external_waits table with poll_while_command column", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "gsd-v23-"));
    const dbPath = join(tmpDir, "gsd.db");

    openDatabase(dbPath);
    const db = _getAdapter()!;
    assert.ok(db, "DB should be open");

    // Verify table exists
    const tableInfo = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='external_waits'"
    ).get() as { name: string } | undefined;
    assert.ok(tableInfo, "external_waits table should exist");

    // Verify columns
    const columns = db.prepare("PRAGMA table_info(external_waits)").all() as Array<{ name: string }>;
    const colNames = columns.map(c => c.name);

    assert.ok(colNames.includes("poll_while_command"), "should have poll_while_command column");
    assert.ok(colNames.includes("success_check"), "should have success_check column");
    assert.ok(colNames.includes("poll_interval_ms"), "should have poll_interval_ms column");
    assert.ok(colNames.includes("timeout_ms"), "should have timeout_ms column");
    assert.ok(colNames.includes("status"), "should have status column");
    assert.ok(colNames.includes("probe_failure_count"), "should have probe_failure_count column");
    assert.ok(colNames.includes("on_timeout"), "should have on_timeout column");
    assert.ok(colNames.includes("context_hint"), "should have context_hint column");
    assert.ok(colNames.includes("registered_at"), "should have registered_at column");
    assert.ok(colNames.includes("resolved_at"), "should have resolved_at column");

    // Verify the old column name does NOT exist
    assert.ok(!colNames.includes("check_command"), "should NOT have old check_command column");
  });

  test("v23 schema version is recorded", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "gsd-v23-ver-"));
    const dbPath = join(tmpDir, "gsd.db");

    openDatabase(dbPath);
    const db = _getAdapter()!;

    const row = db.prepare(
      "SELECT version FROM schema_version WHERE version = 23"
    ).get() as { version: number } | undefined;
    assert.ok(row, "schema_version should contain v23");
    assert.equal(row.version, 23);
  });

  test("idx_external_waits_milestone_status index exists", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "gsd-v23-idx-"));
    const dbPath = join(tmpDir, "gsd.db");

    openDatabase(dbPath);
    const db = _getAdapter()!;

    const idx = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_external_waits_milestone_status'"
    ).get() as { name: string } | undefined;
    assert.ok(idx, "idx_external_waits_milestone_status index should exist");
  });

  test("insertExternalWait + getExternalWait round-trip with poll_while_command", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "gsd-v23-rt-"));
    const dbPath = join(tmpDir, "gsd.db");

    openDatabase(dbPath);
    const db = _getAdapter()!;

    // Insert prerequisite rows
    db.prepare("INSERT INTO milestones (id, title, status) VALUES ('M001', 'Test', 'active')").run();
    db.prepare("INSERT INTO slices (milestone_id, id, title, status) VALUES ('M001', 'S01', 'Test', 'in_progress')").run();
    db.prepare("INSERT INTO tasks (milestone_id, slice_id, id, title, status) VALUES ('M001', 'S01', 'T01', 'Test', 'executing')").run();

    // Use the DB function directly
    const { insertExternalWait, getExternalWait } = await import("../gsd-db.ts");
    insertExternalWait("M001", "S01", "T01", "squeue -j 12345 | grep -c 12345", {
      successCheck: "sacct -j 12345 --format=ExitCode",
      pollIntervalMs: 60000,
      timeoutMs: 3600000,
      contextHint: "SLURM job 12345",
      onTimeout: "resume-with-failure",
    });

    const row = getExternalWait("M001", "S01", "T01");
    assert.ok(row, "should retrieve inserted external wait");
    assert.equal(row.poll_while_command, "squeue -j 12345 | grep -c 12345");
    assert.equal(row.success_check, "sacct -j 12345 --format=ExitCode");
    assert.equal(row.poll_interval_ms, 60000);
    assert.equal(row.timeout_ms, 3600000);
    assert.equal(row.context_hint, "SLURM job 12345");
    assert.equal(row.on_timeout, "resume-with-failure");
    assert.equal(row.status, "waiting");
  });

  test("v22 → v23 migration creates external_waits table on reopen", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "gsd-v23-migrate-"));
    const dbPath = join(tmpDir, "gsd.db");

    // Step 1: Create a minimal v22 DB using raw sqlite (simulates a pre-v23 DB)
    const rawDb = new DatabaseSync(dbPath);
    rawDb.exec("PRAGMA journal_mode=WAL");
    rawDb.exec("PRAGMA foreign_keys=ON");
    rawDb.exec(`
      CREATE TABLE schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);
    // Stamp as v22 — all migrations < 23 are "already applied"
    for (let v = 1; v <= 22; v++) {
      rawDb.prepare("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)").run(v, new Date().toISOString());
    }
    // Create minimal prerequisite tables needed for FK references
    rawDb.exec(`
      CREATE TABLE milestones (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pre-planning',
        depends_on TEXT DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        vision TEXT DEFAULT '',
        success_criteria TEXT DEFAULT '[]',
        key_risks TEXT DEFAULT '[]',
        proof_strategy TEXT DEFAULT '[]',
        verification_contract TEXT DEFAULT '',
        verification_integration TEXT DEFAULT '',
        verification_operational TEXT DEFAULT '',
        verification_uat TEXT DEFAULT '',
        definition_of_done TEXT DEFAULT '[]',
        requirement_coverage TEXT DEFAULT '',
        boundary_map_markdown TEXT DEFAULT ''
      )
    `);
    rawDb.exec(`
      CREATE TABLE slices (
        milestone_id TEXT NOT NULL,
        id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        risk TEXT DEFAULT 'medium',
        depends TEXT DEFAULT '[]',
        demo TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        full_summary_md TEXT DEFAULT '',
        full_uat_md TEXT DEFAULT '',
        goal TEXT DEFAULT '',
        success_criteria TEXT DEFAULT '',
        proof_level TEXT DEFAULT '',
        integration_closure TEXT DEFAULT '',
        observability_impact TEXT DEFAULT '',
        sequence INTEGER DEFAULT 0,
        replan_triggered_at TEXT,
        is_sketch INTEGER DEFAULT 0,
        sketch_scope TEXT DEFAULT '',
        PRIMARY KEY (milestone_id, id)
      )
    `);
    rawDb.exec(`
      CREATE TABLE tasks (
        milestone_id TEXT NOT NULL,
        slice_id TEXT NOT NULL,
        id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        one_liner TEXT DEFAULT '',
        narrative TEXT DEFAULT '',
        verification_result TEXT DEFAULT '',
        duration TEXT DEFAULT '',
        completed_at TEXT,
        blocker_discovered INTEGER DEFAULT 0,
        deviations TEXT DEFAULT '',
        known_issues TEXT DEFAULT '',
        key_files TEXT DEFAULT '[]',
        key_decisions TEXT DEFAULT '[]',
        full_summary_md TEXT DEFAULT '',
        description TEXT DEFAULT '',
        estimate TEXT DEFAULT '',
        files TEXT DEFAULT '[]',
        verify TEXT DEFAULT '',
        inputs TEXT DEFAULT '[]',
        expected_output TEXT DEFAULT '[]',
        observability_impact TEXT DEFAULT '',
        full_plan_md TEXT DEFAULT '',
        sequence INTEGER DEFAULT 0,
        blocker_source TEXT DEFAULT '',
        escalation_pending INTEGER DEFAULT 0,
        escalation_awaiting_review INTEGER DEFAULT 0,
        escalation_artifact_path TEXT,
        escalation_override_applied_at TEXT,
        PRIMARY KEY (milestone_id, slice_id, id)
      )
    `);
    // v22 has no external_waits table — that's the point of this test
    rawDb.close();

    // Step 2: Reopen through GSD's openDatabase, which should trigger migration
    openDatabase(dbPath);
    const db = _getAdapter()!;
    assert.ok(db, "DB should be open");

    // Step 3: Verify external_waits table was created by migration
    const tableInfo = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='external_waits'"
    ).get() as { name: string } | undefined;
    assert.ok(tableInfo, "external_waits table should exist after v22→v23 migration");

    // Verify columns
    const columns = db.prepare("PRAGMA table_info(external_waits)").all() as Array<{ name: string }>;
    const colNames = columns.map(c => c.name);
    assert.ok(colNames.includes("poll_while_command"), "should have poll_while_command column");
    assert.ok(!colNames.includes("check_command"), "should NOT have old check_command column");

    // Verify schema_version was bumped to 23
    const vRow = db.prepare(
      "SELECT version FROM schema_version WHERE version = 23"
    ).get() as { version: number } | undefined;
    assert.ok(vRow, "schema_version should contain v23 after migration");

    // Verify index exists
    const idx = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_external_waits_milestone_status'"
    ).get() as { name: string } | undefined;
    assert.ok(idx, "idx_external_waits_milestone_status should exist after migration");
  });
});
