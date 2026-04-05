/**
 * manual-test-db.ts — DB and artifact persistence layer for manual testing.
 *
 * Bridges the manual-test session model with gsd-db storage and disk artifacts.
 * Kept separate from manual-test.ts to avoid circular deps (manual-test.ts
 * is imported by both the UI and the command handler).
 */

import { join } from "node:path";
import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";

import {
  isDbAvailable,
  insertManualTestSession,
  getLatestManualTestSessionRow,
  updateManualTestSessionStatusDb,
  updateManualTestSessionResults,
  getInProgressSessionRow,
  setManualTestFixPrompt,
  getPendingManualTestFix as getPendingFixFromDb,
  clearManualTestFixPrompt as clearFixFromDb,
  getOutstandingTestFailures,
  type ManualTestSessionRow,
} from "./gsd-db.js";
import {
  sessionCounts,
  type ManualTestSession,
  type ManualTestCheck,
} from "./manual-test.js";
import { gsdRoot } from "./paths.js";

// ─── Save Session ─────────────────────────────────────────────────────────────

/**
 * Persist a manual test session to the DB.
 */
export function saveManualTestSession(session: ManualTestSession): number {
  if (!isDbAvailable()) return -1;

  const counts = sessionCounts(session);
  return insertManualTestSession({
    milestoneId: session.milestoneId,
    sliceId: session.sliceId,
    status: session.status,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    totalChecks: counts.total,
    passed: counts.passed,
    failed: counts.failed,
    skipped: counts.skipped,
    resultsJson: JSON.stringify(session.checks),
    snapshotJson: JSON.stringify(session.snapshot),
  });
}

// ─── Load Session ─────────────────────────────────────────────────────────────

/**
 * Load the latest manual test session for a milestone from the DB.
 */
export function getLatestManualTestSession(milestoneId: string): ManualTestSession | null {
  const row = getLatestManualTestSessionRow(milestoneId);
  if (!row) return null;
  return rowToSession(row);
}

function rowToSession(row: ManualTestSessionRow): ManualTestSession {
  let checks: ManualTestCheck[] = [];
  try {
    if (row.results_json) checks = JSON.parse(row.results_json);
  } catch { /* corrupt JSON — return empty checks */ }

  let snapshot = { phase: "unknown", milestoneProgress: "unknown", slicesComplete: [] as string[] };
  try {
    if (row.snapshot_json) snapshot = JSON.parse(row.snapshot_json);
  } catch { /* corrupt JSON — return defaults */ }

  return {
    id: row.id,
    milestoneId: row.milestone_id,
    sliceId: row.slice_id,
    status: row.status as ManualTestSession["status"],
    startedAt: row.started_at,
    completedAt: row.completed_at,
    checks,
    snapshot,
  };
}

// ─── Update Status ────────────────────────────────────────────────────────────

export function updateManualTestSessionStatus(
  milestoneId: string,
  startedAt: string,
  status: string,
): void {
  if (!isDbAvailable()) return;
  updateManualTestSessionStatusDb(milestoneId, startedAt, status);
}

// ─── Fix Prompt Management ────────────────────────────────────────────────────

export function setPendingManualTestFix(milestoneId: string, fixPrompt: string): void {
  if (!isDbAvailable()) return;
  setManualTestFixPrompt(milestoneId, fixPrompt);
}

export function getPendingManualTestFix(milestoneId: string): { fixPrompt: string; sessionId: number } | null {
  if (!isDbAvailable()) return null;
  return getPendingFixFromDb(milestoneId);
}

export function clearManualTestFixPrompt(milestoneId: string): void {
  if (!isDbAvailable()) return;
  clearFixFromDb(milestoneId);
}

// ─── Outstanding Failures (opportunistic fix dispatch) ────────────────────────

/**
 * Find a session with outstanding test failures that hasn't been dispatched
 * for fixing yet (fix_prompt IS NULL). Used by the opportunistic-fix dispatch
 * rule to detect unfixed failures at natural stopping points.
 */
export function getOutstandingFailures(milestoneId: string): ManualTestSession | null {
  if (!isDbAvailable()) return null;
  const row = getOutstandingTestFailures(milestoneId);
  if (!row) return null;
  return rowToSession(row);
}

// ─── Incremental Persistence ──────────────────────────────────────────────────

/**
 * Update session results in-place (incremental save after each verdict).
 * Guard: returns early if session has no DB id or DB is unavailable.
 */
export function updateSessionResults(session: ManualTestSession): void {
  if (!session.id || !isDbAvailable()) return;
  const counts = sessionCounts(session);
  updateManualTestSessionResults(
    session.id,
    JSON.stringify(session.checks),
    counts.total,
    counts.passed,
    counts.failed,
    counts.skipped,
  );
}

/**
 * Load the latest in-progress session for a milestone (+ optional slice).
 * Returns null if no in-progress session exists or DB is unavailable.
 */
export function getInProgressSession(
  milestoneId: string,
  sliceId: string | null,
): ManualTestSession | null {
  if (!isDbAvailable()) return null;
  const row = getInProgressSessionRow(milestoneId, sliceId);
  if (!row) return null;
  return rowToSession(row);
}

// ─── Artifact Writer ──────────────────────────────────────────────────────────

/**
 * Write the manual test result markdown artifact to disk.
 * Returns the relative path of the written file.
 */
export function writeArtifactDirect(
  session: ManualTestSession,
  content: string,
  basePath: string,
): string {
  const root = gsdRoot(basePath);
  const milestonesDir = join(root, "milestones");

  if (session.sliceId) {
    // Write to the slice directory
    // Find the milestone dir on disk
    const mDir = findMilestoneDir(milestonesDir, session.milestoneId);
    const sliceDir = join(mDir, "slices", session.sliceId);
    mkdirSync(sliceDir, { recursive: true });
    const fileName = `${session.sliceId}-MANUAL-TEST-RESULT.md`;
    const fullPath = join(sliceDir, fileName);
    writeFileSync(fullPath, content, "utf-8");
    return `.gsd/milestones/${session.milestoneId}/slices/${session.sliceId}/${fileName}`;
  } else {
    // Write to the milestone directory
    const mDir = findMilestoneDir(milestonesDir, session.milestoneId);
    mkdirSync(mDir, { recursive: true });
    const fileName = `${session.milestoneId}-MANUAL-TEST-RESULT.md`;
    const fullPath = join(mDir, fileName);
    writeFileSync(fullPath, content, "utf-8");
    return `.gsd/milestones/${session.milestoneId}/${fileName}`;
  }
}

/**
 * Find the actual milestone directory on disk, which may include a unique suffix.
 * Falls back to bare milestone ID if no suffixed directory exists.
 */
function findMilestoneDir(milestonesDir: string, milestoneId: string): string {
  const bare = join(milestonesDir, milestoneId);
  if (existsSync(bare)) return bare;

  // Check for unique-ID directories like M001-abc123
  try {
    const entries = readdirSync(milestonesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && (entry.name === milestoneId || entry.name.startsWith(milestoneId + "-"))) {
        return join(milestonesDir, entry.name);
      }
    }
  } catch { /* directory doesn't exist yet */ }

  // Fallback: create bare directory
  mkdirSync(bare, { recursive: true });
  return bare;
}
