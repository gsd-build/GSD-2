// GSD Extension — State Manifest (Snapshot/Restore)
// Captures complete DB state as portable JSON. Enables fresh-clone
// bootstrap from state-manifest.json without parsing markdown.
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import type { DbAdapter } from "./gsd-db.js";
import { transaction } from "./gsd-db.js";
import { atomicWriteSync } from "./atomic-write.js";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import type { MilestoneRow, SliceRow, TaskRow } from "./workflow-engine.js";

// ─── Manifest Types ──────────────────────────────────────────────────────

export interface DecisionRow {
  id: string;
  when_context: string;
  scope: string;
  decision: string;
  choice: string;
  rationale: string;
  revisable: string;
  made_by: string;
  superseded_by: string | null;
}

export interface VerificationEvidenceRow {
  id: number;
  task_id: string;
  slice_id: string;
  milestone_id: string;
  command: string;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number | null;
  recorded_at: string;
}

export interface StateManifest {
  version: 1;
  exported_at: string; // ISO 8601
  milestones: MilestoneRow[];
  slices: SliceRow[];
  tasks: TaskRow[];
  decisions: DecisionRow[];
  verification_evidence: VerificationEvidenceRow[];
}

// ─── snapshot ────────────────────────────────────────────────────────────

/**
 * Capture complete DB state as a StateManifest.
 * Reads all rows from milestones, slices, tasks, decisions, verification_evidence.
 */
export function snapshot(db: DbAdapter): StateManifest {
  const milestones = db.prepare("SELECT * FROM milestones ORDER BY id").all() as unknown as MilestoneRow[];
  const slices = db.prepare("SELECT * FROM slices ORDER BY milestone_id, seq, id").all() as unknown as SliceRow[];
  const tasks = db.prepare("SELECT * FROM tasks ORDER BY milestone_id, slice_id, seq, id").all() as unknown as TaskRow[];
  const decisions = db.prepare("SELECT id, when_context, scope, decision, choice, rationale, revisable, made_by, superseded_by FROM decisions ORDER BY seq").all() as unknown as DecisionRow[];
  const verification_evidence = db.prepare("SELECT * FROM verification_evidence ORDER BY id").all() as unknown as VerificationEvidenceRow[];

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    milestones,
    slices,
    tasks,
    decisions,
    verification_evidence,
  };
}

// ─── restore ─────────────────────────────────────────────────────────────

/**
 * Atomically replace all workflow state from a manifest.
 * Runs inside a transaction — if any insert fails, no tables are modified.
 * Only touches v5 engine tables + decisions. Does NOT modify artifacts or memories.
 */
export function restore(db: DbAdapter, manifest: StateManifest): void {
  transaction(() => {
    // Clear engine tables (order matters for foreign-key-like consistency)
    db.exec("DELETE FROM verification_evidence");
    db.exec("DELETE FROM tasks");
    db.exec("DELETE FROM slices");
    db.exec("DELETE FROM milestones");
    db.exec("DELETE FROM decisions WHERE 1=1");

    // Restore milestones
    const msStmt = db.prepare(
      "INSERT INTO milestones (id, title, status, created_at, completed_at) VALUES (?, ?, ?, ?, ?)",
    );
    for (const m of manifest.milestones) {
      msStmt.run(m.id, m.title, m.status, m.created_at, m.completed_at);
    }

    // Restore slices
    const slStmt = db.prepare(
      "INSERT INTO slices (id, milestone_id, title, status, risk, depends_on, summary, uat_result, created_at, completed_at, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const s of manifest.slices) {
      slStmt.run(s.id, s.milestone_id, s.title, s.status, s.risk, s.depends_on, s.summary, s.uat_result, s.created_at, s.completed_at, s.seq);
    }

    // Restore tasks
    const tkStmt = db.prepare(
      "INSERT INTO tasks (id, slice_id, milestone_id, title, description, status, estimate, summary, files, verify, started_at, completed_at, blocker, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const t of manifest.tasks) {
      tkStmt.run(t.id, t.slice_id, t.milestone_id, t.title, t.description, t.status, t.estimate, t.summary, t.files, t.verify, t.started_at, t.completed_at, t.blocker, t.seq);
    }

    // Restore decisions
    const dcStmt = db.prepare(
      "INSERT INTO decisions (id, when_context, scope, decision, choice, rationale, revisable, made_by, superseded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const d of manifest.decisions) {
      dcStmt.run(d.id, d.when_context, d.scope, d.decision, d.choice, d.rationale, d.revisable, d.made_by, d.superseded_by);
    }

    // Restore verification evidence
    const evStmt = db.prepare(
      "INSERT INTO verification_evidence (task_id, slice_id, milestone_id, command, exit_code, stdout, stderr, duration_ms, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const e of manifest.verification_evidence) {
      evStmt.run(e.task_id, e.slice_id, e.milestone_id, e.command, e.exit_code, e.stdout, e.stderr, e.duration_ms, e.recorded_at);
    }
  });
}

// ─── writeManifest ───────────────────────────────────────────────────────

/**
 * Write current DB state to .gsd/state-manifest.json via atomicWriteSync.
 * Uses JSON.stringify with 2-space indent for git three-way merge friendliness (D-08).
 */
export function writeManifest(basePath: string, db: DbAdapter): void {
  const manifest = snapshot(db);
  const json = JSON.stringify(manifest, null, 2);
  const dir = join(basePath, ".gsd");
  mkdirSync(dir, { recursive: true });
  atomicWriteSync(join(dir, "state-manifest.json"), json);
}

// ─── bootstrapFromManifest ──────────────────────────────────────────────

/**
 * Read state-manifest.json and restore DB state from it.
 * Returns true if bootstrap succeeded, false if manifest file doesn't exist.
 */
export function bootstrapFromManifest(basePath: string, db: DbAdapter): boolean {
  const manifestPath = join(basePath, ".gsd", "state-manifest.json");

  if (!existsSync(manifestPath)) {
    return false;
  }

  const raw = readFileSync(manifestPath, "utf-8");
  const parsed = JSON.parse(raw) as StateManifest;

  if (parsed.version !== 1) {
    throw new Error(`Unsupported manifest version: ${parsed.version}`);
  }

  restore(db, parsed);
  return true;
}
