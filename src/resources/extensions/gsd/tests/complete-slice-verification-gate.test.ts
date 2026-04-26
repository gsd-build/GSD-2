/**
 * Behavioural regression test for #3580 — complete-slice verification gate.
 *
 * The gate must reject completion when the verification or UAT content
 * indicates a blocked or failed slice. Drives the real handler with
 * blocked-signal fixtures and asserts on the returned error. Replaces an
 * earlier test file that only string-matched the BLOCKED_SIGNALS regex
 * literal in the source (Refs #4826/#4831).
 */

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  insertSlice,
  insertTask,
} from '../gsd-db.ts';
import { handleCompleteSlice } from '../tools/complete-slice.ts';
import type { CompleteSliceParams } from '../types.ts';

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-blocked-gate-'));
  return path.join(dir, 'test.db');
}

function cleanupDb(dbPath: string): void {
  closeDatabase();
  try { fs.rmSync(path.dirname(dbPath), { recursive: true, force: true }); } catch { /* */ }
}

function makeProject(): string {
  const basePath = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-gate-proj-'));
  fs.mkdirSync(path.join(basePath, '.gsd', 'milestones', 'M001', 'slices', 'S01', 'tasks'), { recursive: true });
  fs.writeFileSync(
    path.join(basePath, '.gsd', 'milestones', 'M001', 'M001-ROADMAP.md'),
    `# M001\n\n## Slices\n- [ ] **S01: Test** \`risk:low\` \`depends:[]\`\n  - After this: works\n`,
  );
  return basePath;
}

function makeParams(overrides: Partial<CompleteSliceParams>): CompleteSliceParams {
  return {
    sliceId: 'S01',
    milestoneId: 'M001',
    sliceTitle: 'Test Slice',
    oneLiner: 'one liner',
    narrative: 'narrative',
    verification: 'all green',
    deviations: 'None.',
    knownLimitations: 'None.',
    followUps: 'None.',
    keyFiles: [],
    keyDecisions: [],
    patternsEstablished: [],
    observabilitySurfaces: [],
    provides: [],
    requirementsSurfaced: [],
    drillDownPaths: [],
    affects: [],
    requirementsAdvanced: [],
    requirementsValidated: [],
    requirementsInvalidated: [],
    filesModified: [],
    requires: [],
    uatContent: 'UAT body.',
    ...overrides,
  };
}

describe('complete-slice verification gate (#3580)', () => {
  let dbPath: string;
  let basePath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    openDatabase(dbPath);
    basePath = makeProject();
    insertMilestone({ id: 'M001' });
    insertSlice({ id: 'S01', milestoneId: 'M001' });
    insertTask({ id: 'T01', sliceId: 'S01', milestoneId: 'M001', status: 'complete', title: 'T1' });
  });

  afterEach(() => {
    cleanupDb(dbPath);
    try { fs.rmSync(basePath, { recursive: true, force: true }); } catch { /* */ }
  });

  test('rejects when verification text contains "verification failed"', async () => {
    const result = await handleCompleteSlice(
      makeParams({ verification: 'verification failed: the regression came back' }),
      basePath,
    );
    assert.ok('error' in result, 'expected handler to return an error');
    assert.match((result as { error: string }).error, /blocked|failed|do not complete/i);
  });

  test('rejects when uatContent contains "verification_result: failed"', async () => {
    const result = await handleCompleteSlice(
      makeParams({ uatContent: '## Result\nverification_result: failed\n' }),
      basePath,
    );
    assert.ok('error' in result, 'expected handler to return an error');
    assert.match((result as { error: string }).error, /blocked|failed|do not complete/i);
  });

  test('rejects when verification declares "status: blocked"', async () => {
    const result = await handleCompleteSlice(
      makeParams({ verification: 'status: blocked — db unavailable' }),
      basePath,
    );
    assert.ok('error' in result, 'expected handler to return an error');
    assert.match((result as { error: string }).error, /blocked|failed|do not complete/i);
  });

  test('rejects when uatContent says "slice is blocked"', async () => {
    const result = await handleCompleteSlice(
      makeParams({ uatContent: 'slice is blocked on upstream' }),
      basePath,
    );
    assert.ok('error' in result, 'expected handler to return an error');
    assert.match((result as { error: string }).error, /blocked|failed|do not complete/i);
  });

  test('rejects when verification says "cannot complete"', async () => {
    const result = await handleCompleteSlice(
      makeParams({ verification: 'cannot complete: requirements unmet' }),
      basePath,
    );
    assert.ok('error' in result, 'expected handler to return an error');
    assert.match((result as { error: string }).error, /blocked|failed|do not complete/i);
  });

  test('passes the gate when verification + uatContent are clean', async () => {
    // Sanity: the gate is not over-eager. Clean inputs reach the rest of
    // the handler. (This call may still fail downstream because we provide
    // a thin fixture; the only guarantee here is that the error — if any —
    // is NOT the blocked-signals error.)
    const result = await handleCompleteSlice(
      makeParams({ verification: 'all 8 sections pass', uatContent: 'green across the board' }),
      basePath,
    );
    if ('error' in result) {
      assert.doesNotMatch(
        result.error,
        /blocked\/failed state — do not complete/,
        `clean inputs should not be rejected by the BLOCKED_SIGNALS gate, got: ${result.error}`,
      );
    }
  });
});
