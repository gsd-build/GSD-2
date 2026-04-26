// GSD-2 — write-gate predicate coverage (#4950).
//
// Covers five predicates that had no dedicated tests:
//   shouldBlockQueueExecution, shouldBlockPendingGate,
//   shouldBlockPendingGateBash, shouldBlockContextWrite,
//   shouldBlockContextArtifactSave.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldBlockQueueExecution,
  shouldBlockPendingGate,
  shouldBlockPendingGateBash,
  shouldBlockContextWrite,
  shouldBlockContextArtifactSave,
  setQueuePhaseActive,
  setPendingGate,
  clearPendingGate,
  markDepthVerified,
  clearDiscussionFlowState,
} from '../bootstrap/write-gate.ts';

// ─── shouldBlockQueueExecution ────────────────────────────────────────────

test('shouldBlockQueueExecution: queue inactive → allow write to user source', (t) => {
  t.after(() => clearDiscussionFlowState());
  setQueuePhaseActive(false);
  const r = shouldBlockQueueExecution('write', 'src/main.ts', false);
  assert.strictEqual(r.block, false);
});

test('shouldBlockQueueExecution: queue active → block write to user source', (t) => {
  t.after(() => clearDiscussionFlowState());
  setQueuePhaseActive(true);
  const r = shouldBlockQueueExecution('write', 'src/main.ts', true);
  assert.strictEqual(r.block, true);
  assert.ok(r.reason);
});

test('shouldBlockQueueExecution: queue active → allow write to .gsd/ path', (t) => {
  t.after(() => clearDiscussionFlowState());
  setQueuePhaseActive(true);
  const r = shouldBlockQueueExecution('write', '.gsd/milestones/M001/M001-CONTEXT.md', true);
  assert.strictEqual(r.block, false);
});

test('shouldBlockQueueExecution: queue active → block mutating bash', (t) => {
  t.after(() => clearDiscussionFlowState());
  setQueuePhaseActive(true);
  const r = shouldBlockQueueExecution('bash', 'npm run build', true);
  assert.strictEqual(r.block, true);
  assert.ok(r.reason);
});

test('shouldBlockQueueExecution: queue active → allow read-only bash', (t) => {
  t.after(() => clearDiscussionFlowState());
  setQueuePhaseActive(true);
  const r = shouldBlockQueueExecution('bash', 'git log --oneline -5', true);
  assert.strictEqual(r.block, false);
});

// ─── shouldBlockPendingGate ───────────────────────────────────────────────

test('shouldBlockPendingGate: no pending gate → allow any tool', (t) => {
  t.after(() => clearDiscussionFlowState());
  clearPendingGate();
  const r = shouldBlockPendingGate('write', 'M001');
  assert.strictEqual(r.block, false);
});

test('shouldBlockPendingGate: pending gate → block write', (t) => {
  t.after(() => clearDiscussionFlowState());
  setPendingGate('depth_verification_M001');
  const r = shouldBlockPendingGate('write', 'M001');
  assert.strictEqual(r.block, true);
  assert.ok(r.reason?.includes('depth_verification_M001'));
});

test('shouldBlockPendingGate: pending gate → allow ask_user_questions', (t) => {
  t.after(() => clearDiscussionFlowState());
  setPendingGate('depth_verification_M001');
  const r = shouldBlockPendingGate('ask_user_questions', 'M001');
  assert.strictEqual(r.block, false);
});

test('shouldBlockPendingGate: pending gate → allow read', (t) => {
  t.after(() => clearDiscussionFlowState());
  setPendingGate('depth_verification_M001');
  const r = shouldBlockPendingGate('read', 'M001');
  assert.strictEqual(r.block, false);
});

// ─── shouldBlockPendingGateBash ───────────────────────────────────────────

test('shouldBlockPendingGateBash: no pending gate → allow mutating bash', (t) => {
  t.after(() => clearDiscussionFlowState());
  clearPendingGate();
  const r = shouldBlockPendingGateBash('npm run build', 'M001');
  assert.strictEqual(r.block, false);
});

test('shouldBlockPendingGateBash: pending gate → block mutating bash', (t) => {
  t.after(() => clearDiscussionFlowState());
  setPendingGate('depth_verification_M001');
  const r = shouldBlockPendingGateBash('npm run build', 'M001');
  assert.strictEqual(r.block, true);
  assert.ok(r.reason?.includes('depth_verification_M001'));
});

test('shouldBlockPendingGateBash: pending gate → allow read-only bash (cat)', (t) => {
  t.after(() => clearDiscussionFlowState());
  setPendingGate('depth_verification_M001');
  const r = shouldBlockPendingGateBash('cat README.md', 'M001');
  assert.strictEqual(r.block, false);
});

test('shouldBlockPendingGateBash: pending gate → allow read-only bash (git log)', (t) => {
  t.after(() => clearDiscussionFlowState());
  setPendingGate('depth_verification_M001');
  const r = shouldBlockPendingGateBash('git log --oneline -10', 'M001');
  assert.strictEqual(r.block, false);
});

// ─── shouldBlockContextWrite ──────────────────────────────────────────────

test('shouldBlockContextWrite: non-write tool → allow', (t) => {
  t.after(() => clearDiscussionFlowState());
  const r = shouldBlockContextWrite('read', '.gsd/milestones/M001/M001-CONTEXT.md', 'M001');
  assert.strictEqual(r.block, false);
});

test('shouldBlockContextWrite: write to non-CONTEXT file → allow', (t) => {
  t.after(() => clearDiscussionFlowState());
  const r = shouldBlockContextWrite('write', 'src/index.ts', 'M001');
  assert.strictEqual(r.block, false);
});

test('shouldBlockContextWrite: write to CONTEXT.md without verification → block', (t) => {
  t.after(() => clearDiscussionFlowState());
  const r = shouldBlockContextWrite('write', '.gsd/milestones/M007/M007-CONTEXT.md', 'M007');
  assert.strictEqual(r.block, true);
  assert.ok(r.reason);
});

test('shouldBlockContextWrite: write to CONTEXT.md after verification → allow', (t) => {
  t.after(() => clearDiscussionFlowState());
  markDepthVerified('M008');
  const r = shouldBlockContextWrite('write', '.gsd/milestones/M008/M008-CONTEXT.md', 'M008');
  assert.strictEqual(r.block, false);
});

// ─── shouldBlockContextArtifactSave ───────────────────────────────────────

test('shouldBlockContextArtifactSave: non-CONTEXT artifact type → allow', (t) => {
  t.after(() => clearDiscussionFlowState());
  const r = shouldBlockContextArtifactSave('CONTEXT-DRAFT', 'M001');
  assert.strictEqual(r.block, false);
});

test('shouldBlockContextArtifactSave: slice-level CONTEXT → allow', (t) => {
  t.after(() => clearDiscussionFlowState());
  const r = shouldBlockContextArtifactSave('CONTEXT', 'M001', 'S01');
  assert.strictEqual(r.block, false);
});

test('shouldBlockContextArtifactSave: milestone CONTEXT without verification → block', (t) => {
  t.after(() => clearDiscussionFlowState());
  const r = shouldBlockContextArtifactSave('CONTEXT', 'M009');
  assert.strictEqual(r.block, true);
  assert.ok(r.reason?.includes('M009'));
});

test('shouldBlockContextArtifactSave: milestone CONTEXT after verification → allow', (t) => {
  t.after(() => clearDiscussionFlowState());
  markDepthVerified('M010');
  const r = shouldBlockContextArtifactSave('CONTEXT', 'M010');
  assert.strictEqual(r.block, false);
});

test('shouldBlockContextArtifactSave: CONTEXT with no milestoneId → block', (t) => {
  t.after(() => clearDiscussionFlowState());
  const r = shouldBlockContextArtifactSave('CONTEXT', null);
  assert.strictEqual(r.block, true);
  assert.ok(r.reason);
});
