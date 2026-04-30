// GSD-2 + Regression tests for auto-mode discuss-milestone write-gate deadlock (#4973)
//
// The depth-verification write-gate in write-gate.ts:415-443 blocks
// gsd_summary_save({artifact_type:"CONTEXT"}) until markDepthVerified() is
// called. In interactive mode this happens when the user picks the confirmation
// option in ask_user_questions. In auto-mode there is no human — the gate
// deadlocked every discuss-milestone unit, wasting 200K-360K tokens per run.
//
// Fix: each dispatch rule that fires a discuss-milestone unit now calls
// markDepthVerified(mid) when isAutoActive() is true, before returning the
// dispatch action. These tests verify:
//   Test 1 — CONTEXT artifact save unblocks after markDepthVerified
//   Test 2 — raw write to *-CONTEXT.md unblocks after markDepthVerified
//   Test 3 — session_switch ordering: clearDiscussionFlowState clears the mark
//   Test 4 — interactive sessions (isAutoActive===false) are unaffected

import { describe, test, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  markDepthVerified,
  clearDiscussionFlowState,
  shouldBlockContextArtifactSaveInSnapshot,
  shouldBlockContextWrite,
  loadWriteGateSnapshot,
  isMilestoneDepthVerifiedInSnapshot,
} from '../bootstrap/write-gate.ts';

import { DISPATCH_RULES, type DispatchContext } from '../auto-dispatch.ts';
import { _setAutoActiveForTest } from '../auto.ts';

// Reset all relevant state before and after each test.
function resetState(): void {
  _setAutoActiveForTest(false);
  clearDiscussionFlowState();
}

describe('auto-discuss-milestone-deadlock-4973', () => {
  beforeEach(resetState);
  afterEach(resetState);

  // ── Test 1 ──────────────────────────────────────────────────────────────
  // CONTEXT artifact save via gsd_summary_save is blocked before the mark
  // and unblocked after it. This is the exact path that deadlocked in #4973:
  // workflow-tool-executors.ts calls shouldBlockContextArtifactSaveInSnapshot
  // against a snapshot that had no verified milestones.
  test('Test 1: CONTEXT artifact save unblocks after markDepthVerified (auto-mode)', () => {
    _setAutoActiveForTest(true);

    // Before mark: blocked
    const snapshotBefore = loadWriteGateSnapshot();
    const beforeResult = shouldBlockContextArtifactSaveInSnapshot(
      snapshotBefore,
      'CONTEXT',
      'M001',
      null,
    );
    assert.strictEqual(beforeResult.block, true, 'should block before markDepthVerified');

    // Simulate what the dispatch rule now does in auto-mode
    markDepthVerified('M001');

    // After mark: unblocked
    const snapshotAfter = loadWriteGateSnapshot();
    const afterResult = shouldBlockContextArtifactSaveInSnapshot(
      snapshotAfter,
      'CONTEXT',
      'M001',
      null,
    );
    assert.strictEqual(afterResult.block, false, 'should not block after markDepthVerified');
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────
  // Raw write tool to a *-CONTEXT.md path is also gated. The register-hooks
  // tool_call handler calls shouldBlockContextWrite for write events.
  test('Test 2: raw write to M001-CONTEXT.md unblocks after markDepthVerified (auto-mode)', () => {
    _setAutoActiveForTest(true);

    const contextPath = '.gsd/milestones/M001/M001-CONTEXT.md';

    // Before mark: blocked
    const beforeResult = shouldBlockContextWrite('write', contextPath, 'M001');
    assert.strictEqual(beforeResult.block, true, 'write should be blocked before markDepthVerified');

    // Simulate dispatch rule auto-mark
    markDepthVerified('M001');

    // After mark: unblocked
    const afterResult = shouldBlockContextWrite('write', contextPath, 'M001');
    assert.strictEqual(afterResult.block, false, 'write should not be blocked after markDepthVerified');
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────
  // Documents the session_switch ordering contract.
  //
  // When auto-mode dispatches a new session, the event sequence is:
  //   session_switch → clearDiscussionFlowState() (register-hooks.ts:106)
  //   before_agent_start fires
  //   resolveDispatch is called → discuss-milestone rule match fn runs
  //   markDepthVerified(mid) is called HERE (after the clear)
  //
  // This test demonstrates that clearDiscussionFlowState() (the session_switch
  // side effect) clears any previously set mark, and that calling
  // markDepthVerified after the clear correctly re-establishes it — proving
  // the dispatch-site call site is safe regardless of prior session state.
  test('Test 3: session_switch ordering — clearDiscussionFlowState clears mark; dispatch-site call re-establishes it', () => {
    // Simulate a mark from a prior session
    markDepthVerified('M001');
    let snapshot = loadWriteGateSnapshot();
    assert.strictEqual(
      isMilestoneDepthVerifiedInSnapshot(snapshot, 'M001'),
      true,
      'precondition: mark set from prior session',
    );

    // session_switch fires clearDiscussionFlowState() — this is exactly what
    // register-hooks.ts:106 does
    clearDiscussionFlowState();
    snapshot = loadWriteGateSnapshot();
    assert.strictEqual(
      isMilestoneDepthVerifiedInSnapshot(snapshot, 'M001'),
      false,
      'session_switch (clearDiscussionFlowState) must clear the mark',
    );

    // Now the dispatch rule fires (after session_switch cleared state)
    // and re-establishes the mark for the new session
    _setAutoActiveForTest(true);
    markDepthVerified('M001'); // this is what the dispatch rule does

    snapshot = loadWriteGateSnapshot();
    assert.strictEqual(
      isMilestoneDepthVerifiedInSnapshot(snapshot, 'M001'),
      true,
      'dispatch-site markDepthVerified re-establishes the mark after session_switch cleared it',
    );

    // And the artifact save is now unblocked for this session
    const result = shouldBlockContextArtifactSaveInSnapshot(snapshot, 'CONTEXT', 'M001', null);
    assert.strictEqual(result.block, false, 'CONTEXT save unblocked in the new session');
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────
  // Interactive sessions (isAutoActive()===false) must NOT be auto-marked.
  // The dispatch rules guard the markDepthVerified call with isAutoActive(),
  // so in a non-auto session the gate still requires the human to confirm.
  // This test passes on both current main AND with the fix applied.
  test('Test 4: interactive sessions unaffected — gate still blocks unverified milestones when auto is off', () => {
    _setAutoActiveForTest(false);

    // Do NOT call markDepthVerified — simulating that dispatch rule's
    // isAutoActive() guard prevented the auto-mark (as it should for
    // interactive sessions)

    // CONTEXT artifact save is still blocked
    const snapshotResult = shouldBlockContextArtifactSaveInSnapshot(
      loadWriteGateSnapshot(),
      'CONTEXT',
      'M002',
      null,
    );
    assert.strictEqual(
      snapshotResult.block,
      true,
      'CONTEXT save must still be blocked in interactive mode without depth verification',
    );

    // Raw write to CONTEXT.md is still blocked
    const writeResult = shouldBlockContextWrite(
      'write',
      '.gsd/milestones/M002/M002-CONTEXT.md',
      'M002',
    );
    assert.strictEqual(
      writeResult.block,
      true,
      'write to CONTEXT.md must still be blocked in interactive mode',
    );
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────
  // The actual fix lives inside the discuss-milestone dispatch rules at
  // auto-dispatch.ts:280-291, :423-432, :449-458. This test invokes the
  // "needs-discussion → discuss-milestone" rule directly and asserts that
  // (a) the rule auto-marks depth-verified when non-deep auto-mode is active,
  // (b) it does NOT mark when deep planning is active, and
  // (c) it does NOT mark when isAutoActive() is false.
  //
  // This is the test codex flagged as missing: Tests 1-4 above only exercise
  // the markDepthVerified primitive — they pass on origin/main. This Test 5
  // FAILS on origin/main (the rule does nothing for the gate) and PASSES with
  // the fix (the rule calls markDepthVerified inside isAutoActive()).
  test('Test 5: needs-discussion dispatch rule auto-marks depth-verified in auto-mode', async () => {
    const rule = DISPATCH_RULES.find(r => r.name === 'needs-discussion → discuss-milestone');
    assert.ok(rule, 'dispatch rule must exist');

    // Use a real temp directory so the snapshot file the rule writes is
    // readable by the same loadWriteGateSnapshot(basePath) the test reads
    // from. The rule passes basePath through to markDepthVerified (since
    // commit 73bb7e085) — without this, the rule writes the snapshot under
    // basePath but the test would read process.cwd() and never see it.
    const tempBase = mkdtempSync(join(tmpdir(), '4973-rule-test-'));
    const snapshotFile = join(tempBase, '.gsd', 'runtime', 'write-gate-state.json');
    try {
      const baseCtx = {
        basePath: tempBase,
        mid: 'M005',
        midTitle: 'Test Milestone',
        state: { phase: 'needs-discussion' },
        prefs: undefined,
        structuredQuestionsAvailable: 'false',
      } as unknown as DispatchContext;

      // ── Non-deep auto-mode case: the rule must call markDepthVerified ──
      _setAutoActiveForTest(true);
      let snap = loadWriteGateSnapshot(tempBase);
      assert.strictEqual(
        isMilestoneDepthVerifiedInSnapshot(snap, 'M005'),
        false,
        'precondition: M005 not yet marked',
      );

      // The rule's match fn calls markDepthVerified(mid, basePath) BEFORE
      // awaiting buildDiscussMilestonePrompt — so even if the prompt build
      // fails (e.g. because basePath does not contain a valid milestone),
      // the side effect (snapshot write) has already happened.
      try { await rule!.match(baseCtx); } catch { /* prompt build may fail; we only care about the mark */ }

      snap = loadWriteGateSnapshot(tempBase);
      assert.strictEqual(
        isMilestoneDepthVerifiedInSnapshot(snap, 'M005'),
        true,
        'non-deep auto-mode: dispatch rule must call markDepthVerified(mid) — this fails on origin/main without the H6 fix',
      );

      // ── Deep auto-mode case: the user-facing approval gate must stay closed ──
      clearDiscussionFlowState();
      if (existsSync(snapshotFile)) unlinkSync(snapshotFile);
      _setAutoActiveForTest(true);
      const deepCtx = {
        ...baseCtx,
        prefs: { planning_depth: 'deep' },
      } as unknown as DispatchContext;
      snap = loadWriteGateSnapshot(tempBase);
      assert.strictEqual(
        isMilestoneDepthVerifiedInSnapshot(snap, 'M005'),
        false,
        'precondition: state cleared before deep-mode dispatch',
      );

      try { await rule!.match(deepCtx); } catch { /* prompt build may fail */ }

      snap = loadWriteGateSnapshot(tempBase);
      assert.strictEqual(
        isMilestoneDepthVerifiedInSnapshot(snap, 'M005'),
        false,
        'deep auto-mode: dispatch rule must not pre-verify a user-facing milestone gate',
      );

      // ── Interactive case: the rule must NOT call markDepthVerified ──
      // clearDiscussionFlowState() only deletes the snapshot at process.cwd(),
      // so we must explicitly remove the snapshot under our tempBase too.
      clearDiscussionFlowState();
      if (existsSync(snapshotFile)) unlinkSync(snapshotFile);
      _setAutoActiveForTest(false);
      snap = loadWriteGateSnapshot(tempBase);
      assert.strictEqual(
        isMilestoneDepthVerifiedInSnapshot(snap, 'M005'),
        false,
        'precondition: state cleared',
      );

      try { await rule!.match(baseCtx); } catch { /* prompt build may fail */ }

      snap = loadWriteGateSnapshot(tempBase);
      assert.strictEqual(
        isMilestoneDepthVerifiedInSnapshot(snap, 'M005'),
        false,
        'interactive mode: dispatch rule must NOT call markDepthVerified — humans still confirm',
      );
    } finally {
      rmSync(tempBase, { recursive: true, force: true });
    }
  });
});
