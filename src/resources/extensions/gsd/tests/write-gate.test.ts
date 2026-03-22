/**
 * Unit tests for the CONTEXT.md write-gate (D031 guard chain).
 *
 * Exercises shouldBlockContextWrite() — a pure function that implements:
 *   (a) toolName !== "write" → pass
 *   (b) milestoneId null → pass (not in discussion)
 *   (c) path doesn't match /M\d+-CONTEXT\.md$/ → pass
 *   (d) depthVerified → pass
 *   (e) else → block with actionable reason
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldBlockContextWrite,
  isDepthVerified,
  isQueuePhaseActive,
  setQueuePhaseActive,
} from '../index.ts';
import {
  markDepthVerified,
  clearDiscussionFlowState,
  resetWriteGateState,
} from '../bootstrap/write-gate.ts';

// ─── Scenario 1: Blocks CONTEXT.md write during discussion without depth verification (absolute path) ──

test('write-gate: blocks CONTEXT.md write during discussion without depth verification (absolute path)', () => {
  const result = shouldBlockContextWrite(
    'write',
    '/Users/dev/project/.gsd/milestones/M001/M001-CONTEXT.md',
    'M001',
    false,
  );
  assert.strictEqual(result.block, true, 'should block the write');
  assert.ok(result.reason, 'should provide a reason');
});

// ─── Scenario 2: Blocks CONTEXT.md write during discussion without depth verification (relative path) ──

test('write-gate: blocks CONTEXT.md write during discussion without depth verification (relative path)', () => {
  const result = shouldBlockContextWrite(
    'write',
    '.gsd/milestones/M005/M005-CONTEXT.md',
    'M005',
    false,
  );
  assert.strictEqual(result.block, true, 'should block the write');
  assert.ok(result.reason, 'should provide a reason');
});

// ─── Scenario 3: Allows CONTEXT.md write after depth verification ──

test('write-gate: allows CONTEXT.md write after depth verification', () => {
  const result = shouldBlockContextWrite(
    'write',
    '/Users/dev/project/.gsd/milestones/M001/M001-CONTEXT.md',
    'M001',
    true,
  );
  assert.strictEqual(result.block, false, 'should not block after depth verification');
  assert.strictEqual(result.reason, undefined, 'should have no reason');
});

// ─── Scenario 4: Allows CONTEXT.md write outside discussion phase (milestoneId null) ──

test('write-gate: allows CONTEXT.md write outside discussion phase', () => {
  const result = shouldBlockContextWrite(
    'write',
    '.gsd/milestones/M001/M001-CONTEXT.md',
    null,
    false,
  );
  assert.strictEqual(result.block, false, 'should not block outside discussion phase');
});

// ─── Scenario 5: Allows non-CONTEXT.md writes during discussion ──

test('write-gate: allows non-CONTEXT.md writes during discussion', () => {
  // DISCUSSION.md
  const r1 = shouldBlockContextWrite(
    'write',
    '.gsd/milestones/M001/M001-DISCUSSION.md',
    'M001',
    false,
  );
  assert.strictEqual(r1.block, false, 'DISCUSSION.md should pass');

  // Slice file
  const r2 = shouldBlockContextWrite(
    'write',
    '.gsd/milestones/M001/slices/S01/S01-PLAN.md',
    'M001',
    false,
  );
  assert.strictEqual(r2.block, false, 'slice plan should pass');

  // Regular code file
  const r3 = shouldBlockContextWrite(
    'write',
    'src/index.ts',
    'M001',
    false,
  );
  assert.strictEqual(r3.block, false, 'regular code file should pass');
});

// ─── Scenario 6: Regex specificity — doesn't match S01-CONTEXT.md ──

test('write-gate: regex does not match slice context files (S01-CONTEXT.md)', () => {
  const result = shouldBlockContextWrite(
    'write',
    '.gsd/milestones/M001/slices/S01/S01-CONTEXT.md',
    'M001',
    false,
  );
  assert.strictEqual(result.block, false, 'S01-CONTEXT.md should not be blocked');
});

// ─── Scenario 7: Error message contains actionable instruction ──

test('write-gate: blocked reason contains depth_verification keyword', () => {
  const result = shouldBlockContextWrite(
    'write',
    '.gsd/milestones/M999/M999-CONTEXT.md',
    'M999',
    false,
  );
  assert.strictEqual(result.block, true);
  assert.ok(result.reason!.includes('depth_verification'), 'reason should mention depth_verification question id');
  assert.ok(result.reason!.includes('ask_user_questions'), 'reason should mention ask_user_questions tool');
});

// ─── Scenario 8: Queue mode blocks CONTEXT.md write without depth verification ──

test('write-gate: blocks CONTEXT.md write in queue mode without depth verification', () => {
  const result = shouldBlockContextWrite(
    'write',
    '.gsd/milestones/M001/M001-CONTEXT.md',
    null,   // no milestoneId in queue mode
    false,  // not depth-verified
    true,   // queue phase active
  );
  assert.strictEqual(result.block, true, 'should block in queue mode without depth verification');
  assert.ok(result.reason, 'should provide a reason');
});

// ─── Scenario 9: Queue mode allows CONTEXT.md write after depth verification ──

test('write-gate: allows CONTEXT.md write in queue mode after depth verification', () => {
  const result = shouldBlockContextWrite(
    'write',
    '.gsd/milestones/M001/M001-CONTEXT.md',
    null,   // no milestoneId in queue mode
    true,   // depth-verified
    true,   // queue phase active
  );
  assert.strictEqual(result.block, false, 'should not block in queue mode after depth verification');
});

// ─── Scenario 10: markDepthVerified works in queue-only mode (no milestoneId) ──
// This is the core regression for #1812: in queue mode, the tool_result handler
// must call markDepthVerified() even when getDiscussionMilestoneId() is null.

test('write-gate: markDepthVerified unblocks queue-mode writes when milestoneId is null', () => {
  clearDiscussionFlowState();
  setQueuePhaseActive(true);

  // Before marking: should block
  const blocked = shouldBlockContextWrite(
    'write',
    '.gsd/milestones/M001/M001-CONTEXT.md',
    null,
    isDepthVerified(),
    isQueuePhaseActive(),
  );
  assert.strictEqual(blocked.block, true, 'should block before markDepthVerified');

  // Simulate what the fixed tool_result handler does
  markDepthVerified();

  // After marking: should pass
  const allowed = shouldBlockContextWrite(
    'write',
    '.gsd/milestones/M001/M001-CONTEXT.md',
    null,
    isDepthVerified(),
    isQueuePhaseActive(),
  );
  assert.strictEqual(allowed.block, false, 'should allow after markDepthVerified in queue mode');

  clearDiscussionFlowState();
});
