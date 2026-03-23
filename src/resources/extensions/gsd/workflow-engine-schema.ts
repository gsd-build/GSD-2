// GSD Extension — Schema v5: Workflow Engine Tables
// Adds milestones, slices, tasks, and verification_evidence tables
// to the existing SQLite database for the single-writer state engine.

import type { DbAdapter } from "./gsd-db.js";

/**
 * Migrate the database from schema v4 to v5 by creating the four
 * WorkflowEngine tables and their indexes.
 *
 * This function is called inside the existing migrateSchema() transaction
 * in gsd-db.ts — it must NOT open its own transaction.
 */
export function migrateToV5(db: DbAdapter): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT '',
      completed_at TEXT DEFAULT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS slices (
      id TEXT NOT NULL,
      milestone_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      risk TEXT NOT NULL DEFAULT 'low',
      depends_on TEXT NOT NULL DEFAULT '[]',
      summary TEXT DEFAULT NULL,
      uat_result TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT '',
      completed_at TEXT DEFAULT NULL,
      seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (milestone_id, id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT NOT NULL,
      slice_id TEXT NOT NULL,
      milestone_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      estimate TEXT NOT NULL DEFAULT '',
      summary TEXT DEFAULT NULL,
      files TEXT NOT NULL DEFAULT '[]',
      verify TEXT DEFAULT NULL,
      started_at TEXT DEFAULT NULL,
      completed_at TEXT DEFAULT NULL,
      blocker TEXT DEFAULT NULL,
      seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (milestone_id, slice_id, id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS verification_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      slice_id TEXT NOT NULL,
      milestone_id TEXT NOT NULL,
      command TEXT NOT NULL DEFAULT '',
      exit_code INTEGER DEFAULT NULL,
      stdout TEXT NOT NULL DEFAULT '',
      stderr TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER DEFAULT NULL,
      recorded_at TEXT NOT NULL DEFAULT ''
    )
  `);

  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slices_status ON slices(status)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_verification_task ON verification_evidence(milestone_id, slice_id, task_id)",
  );
}
