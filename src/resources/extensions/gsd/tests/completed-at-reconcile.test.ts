/**
 * Behavioural regression test for #4129.
 *
 * When deriveStateFromDb's reconcileSliceTasks finds a SUMMARY.md on disk
 * for a task whose DB row is still pending, it flips the row to "complete".
 * Before #4129, the call to updateTaskStatus omitted the completedAt
 * timestamp, leaving completed_at NULL forever.
 *
 * The fix passes new Date().toISOString() as the 5th argument; this test
 * exercises that path end-to-end and asserts the column is populated.
 *
 * Refs #4829 (rewrite from positional source-grep).
 */

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { deriveStateFromDb, invalidateStateCache } from '../state.ts';
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  insertSlice,
  insertTask,
  getTask,
} from '../gsd-db.ts';

let basePath: string;

function setupProject(): void {
  basePath = mkdtempSync(join(tmpdir(), 'gsd-completed-at-'));
  // Project structure with active milestone, one slice, one task whose
  // SUMMARY.md is already on disk — but the DB row is still "pending".
  mkdirSync(join(basePath, '.gsd', 'milestones', 'M001', 'slices', 'S01', 'tasks'), { recursive: true });

  // CONTEXT + ROADMAP so deriveState identifies M001 as active and S01 as the active slice.
  writeFileSync(
    join(basePath, '.gsd', 'milestones', 'M001', 'M001-CONTEXT.md'),
    '# M001\nActive milestone.\n',
  );
  writeFileSync(
    join(basePath, '.gsd', 'milestones', 'M001', 'M001-ROADMAP.md'),
    `# M001\n\n## Slices\n\n- [ ] **S01: Slice** \`risk:low\` \`depends:[]\`\n  - After this: works\n`,
  );

  // Plan file for the slice so reconcile can populate task list if DB is empty.
  writeFileSync(
    join(basePath, '.gsd', 'milestones', 'M001', 'slices', 'S01', 'S01-PLAN.md'),
    `# S01: Slice\n\n## Tasks\n\n- [ ] **T01: Test task** \`est:30m\`\n  - Do: x\n  - Verify: y\n`,
  );

  // The summary file: this is the on-disk evidence that flips the task
  // status to "complete" inside reconcileSliceTasks.
  writeFileSync(
    join(basePath, '.gsd', 'milestones', 'M001', 'slices', 'S01', 'tasks', 'T01-SUMMARY.md'),
    '---\nid: T01\nparent: S01\nmilestone: M001\nblocker_discovered: false\n---\n# T01\n',
  );
}

describe('completed_at reconcile (#4129)', () => {
  beforeEach(() => {
    setupProject();
    openDatabase(join(basePath, '.gsd', 'gsd.db'));
    insertMilestone({ id: 'M001', title: 'M001', status: 'active' });
    insertSlice({ id: 'S01', milestoneId: 'M001', title: 'Slice', status: 'active' });
    // Task is "pending" in DB, but SUMMARY.md exists on disk → reconcile flips it.
    insertTask({ id: 'T01', sliceId: 'S01', milestoneId: 'M001', title: 'Test task', status: 'pending' });
    invalidateStateCache();
  });

  afterEach(() => {
    closeDatabase();
    try { rmSync(basePath, { recursive: true, force: true }); } catch { /* */ }
  });

  test('reconcileSliceTasks sets completed_at when flipping a pending task to complete via SUMMARY.md', async () => {
    const before = getTask('M001', 'S01', 'T01');
    assert.strictEqual(before?.status, 'pending', 'task starts pending');
    assert.strictEqual(before?.completed_at, null, 'task starts with completed_at NULL');

    // Trigger the reconcile path (state.ts → reconcileSliceTasks).
    await deriveStateFromDb(basePath);

    const after = getTask('M001', 'S01', 'T01');
    assert.strictEqual(after?.status, 'complete', 'task should be flipped to complete');
    assert.ok(
      typeof after?.completed_at === 'string' && after.completed_at.length > 0,
      `completed_at must be populated by reconcileSliceTasks (#4129); got ${JSON.stringify(after?.completed_at)}`,
    );
    // Sanity: timestamp parses as a valid ISO date.
    assert.ok(
      !Number.isNaN(Date.parse(after!.completed_at!)),
      `completed_at should be a valid ISO timestamp, got ${after!.completed_at}`,
    );
  });
});
