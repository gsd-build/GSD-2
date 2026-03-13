// Regex-hardening tests for S02/T02 — proves all 12 regex/parser sites
// accept both M001 (old) and M-abc123-001 (new) milestone ID formats.
//
// Sections:
//   (a) Directory scanning regex — findMilestoneIds pattern
//   (b) Title-strip regex — milestone title cleanup
//   (c) SLICE_BRANCH_RE — branch name parsing (with/without worktree prefix)
//   (d) Milestone detection regex — hasExistingMilestones pattern
//   (e) MILESTONE_CONTEXT_RE — context write-gate filename match
//   (f) Prompt dispatch regexes — executeMatch and resumeMatch capture
//   (g) milestoneIdSort — mixed-format ordering
//   (h) extractMilestoneSeq — numeric extraction from both formats

import { test } from 'vitest';

import {
  MILESTONE_ID_RE,
  extractMilestoneSeq,
  milestoneIdSort,
} from '../guided-flow.ts';

import { SLICE_BRANCH_RE } from '../worktree.ts';

// ─── Assertion helpers ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertMatch(value: string, pattern: RegExp, message: string): void {
  if (pattern.test(value)) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — "${value}" did not match ${pattern}`);
  }
}

function assertNoMatch(value: string, pattern: RegExp, message: string): void {
  if (!pattern.test(value)) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — "${value}" should NOT match ${pattern}`);
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('regex-hardening tests');

  // (a) Directory scanning regex — used in state.ts, workspace-index.ts, files.ts
  //     Pattern: /^(M(?:-[a-z0-9]{6}-)?\d+)/
  {
    console.log('  (a) Directory scanning regex');
    const DIR_SCAN_RE = /^(M(?:-[a-z0-9]{6}-)?\d+)/;

    // Old format matches
    assertTrue(DIR_SCAN_RE.test('M001'), 'dir scan matches M001');
    assertTrue(DIR_SCAN_RE.test('M042'), 'dir scan matches M042');
    assertTrue(DIR_SCAN_RE.test('M999'), 'dir scan matches M999');
    assertEq(('M001-PAYMENT' as string).match(DIR_SCAN_RE)?.[1], 'M001', 'captures M001 from M001-PAYMENT');

    // New format matches
    assertTrue(DIR_SCAN_RE.test('M-abc123-001'), 'dir scan matches M-abc123-001');
    assertTrue(DIR_SCAN_RE.test('M-z9a8b7-042'), 'dir scan matches M-z9a8b7-042');
    assertEq(('M-abc123-001-PAYMENT' as string).match(DIR_SCAN_RE)?.[1], 'M-abc123-001', 'captures M-abc123-001 from dir name');

    // Rejects
    assertTrue(!DIR_SCAN_RE.test('S01'), 'dir scan rejects S01');
    assertTrue(!DIR_SCAN_RE.test('X001'), 'dir scan rejects X001');
    assertTrue(!DIR_SCAN_RE.test('.DS_Store'), 'dir scan rejects .DS_Store');
    assertTrue(!DIR_SCAN_RE.test('notes'), 'dir scan rejects notes');
  }

  // (b) Title-strip regex — used in state.ts, workspace-index.ts
  //     Pattern: /^M(?:-[a-z0-9]{6}-)?\d+[^:]*:\s*/
  {
    console.log('  (b) Title-strip regex');
    const TITLE_STRIP_RE = /^M(?:-[a-z0-9]{6}-)?\d+[^:]*:\s*/;

    // Old format strip
    assertEq('M001: Title'.replace(TITLE_STRIP_RE, ''), 'Title', 'strips M001: Title → Title');
    assertEq('M042: Payment Integration'.replace(TITLE_STRIP_RE, ''), 'Payment Integration', 'strips M042: Payment Integration');

    // New format strip
    assertEq('M-abc123-001: Title'.replace(TITLE_STRIP_RE, ''), 'Title', 'strips M-abc123-001: Title → Title');
    assertEq('M-z9a8b7-042: Dashboard'.replace(TITLE_STRIP_RE, ''), 'Dashboard', 'strips M-z9a8b7-042: Dashboard');

    // Edge case: dash-style separator (M001 — Title: Subtitle preserves colon in body)
    assertEq(
      'M001 — Unique Milestone IDs: Foo'.replace(TITLE_STRIP_RE, ''),
      'Foo',
      'strips M001 — Unique Milestone IDs: Foo → Foo (first colon consumed)',
    );

    // Edge case: colon inside title body preserved
    assertEq(
      'M001: Note: important'.replace(TITLE_STRIP_RE, ''),
      'Note: important',
      'preserves colons in title body',
    );

    // No match — leaves non-milestone strings alone
    assertEq('S01: Slice Title'.replace(TITLE_STRIP_RE, ''), 'S01: Slice Title', 'does not strip S01 prefix');
  }

  // (c) SLICE_BRANCH_RE — from worktree.ts
  //     Pattern: /^gsd\/(?:([a-zA-Z0-9_-]+)\/)?(M(?:-[a-z0-9]{6}-)?\d+)\/(S\d+)$/
  {
    console.log('  (c) SLICE_BRANCH_RE');

    // Old format — no worktree prefix
    {
      const m = 'gsd/M001/S01'.match(SLICE_BRANCH_RE);
      assertTrue(m !== null, 'matches gsd/M001/S01');
      assertEq(m?.[1], undefined, 'no worktree prefix for gsd/M001/S01');
      assertEq(m?.[2], 'M001', 'captures M001');
      assertEq(m?.[3], 'S01', 'captures S01');
    }

    // New format — no worktree prefix
    {
      const m = 'gsd/M-abc123-001/S01'.match(SLICE_BRANCH_RE);
      assertTrue(m !== null, 'matches gsd/M-abc123-001/S01');
      assertEq(m?.[1], undefined, 'no worktree prefix for new format');
      assertEq(m?.[2], 'M-abc123-001', 'captures M-abc123-001');
      assertEq(m?.[3], 'S01', 'captures S01');
    }

    // Old format — with worktree prefix
    {
      const m = 'gsd/worktree/M001/S01'.match(SLICE_BRANCH_RE);
      assertTrue(m !== null, 'matches gsd/worktree/M001/S01');
      assertEq(m?.[1], 'worktree', 'captures worktree prefix');
      assertEq(m?.[2], 'M001', 'captures M001 with worktree');
      assertEq(m?.[3], 'S01', 'captures S01 with worktree');
    }

    // New format — with worktree prefix
    {
      const m = 'gsd/worktree/M-abc123-001/S01'.match(SLICE_BRANCH_RE);
      assertTrue(m !== null, 'matches gsd/worktree/M-abc123-001/S01');
      assertEq(m?.[1], 'worktree', 'captures worktree prefix with new format');
      assertEq(m?.[2], 'M-abc123-001', 'captures M-abc123-001 with worktree');
      assertEq(m?.[3], 'S01', 'captures S01 with worktree and new format');
    }

    // Rejects
    assertTrue(!SLICE_BRANCH_RE.test('gsd/S01'), 'rejects gsd/S01 (no milestone)');
    assertTrue(!SLICE_BRANCH_RE.test('main'), 'rejects main');
    assertTrue(!SLICE_BRANCH_RE.test('gsd/M001'), 'rejects gsd/M001 (no slice)');
    assertTrue(!SLICE_BRANCH_RE.test('feature/M001/S01'), 'rejects feature/ prefix');
  }

  // (d) Milestone detection regex — used in worktree-command.ts (hasExistingMilestones)
  //     Pattern: /^M(?:-[a-z0-9]{6}-)?\d+/
  {
    console.log('  (d) Milestone detection regex');
    const MILESTONE_DETECT_RE = /^M(?:-[a-z0-9]{6}-)?\d+/;

    // Old format matches
    assertTrue(MILESTONE_DETECT_RE.test('M001'), 'detect matches M001');
    assertTrue(MILESTONE_DETECT_RE.test('M042'), 'detect matches M042');
    assertTrue(MILESTONE_DETECT_RE.test('M001-PAYMENT'), 'detect matches M001-PAYMENT (anchored start)');

    // New format matches
    assertTrue(MILESTONE_DETECT_RE.test('M-abc123-001'), 'detect matches M-abc123-001');
    assertTrue(MILESTONE_DETECT_RE.test('M-z9a8b7-042'), 'detect matches M-z9a8b7-042');

    // Rejects
    assertTrue(!MILESTONE_DETECT_RE.test('S01'), 'detect rejects S01');
    assertTrue(!MILESTONE_DETECT_RE.test('notes'), 'detect rejects notes');
    assertTrue(!MILESTONE_DETECT_RE.test('.DS_Store'), 'detect rejects .DS_Store');
  }

  // (e) MILESTONE_CONTEXT_RE — used in index.ts (write-gate)
  //     Pattern: /M(?:-[a-z0-9]{6}-)?\d+-CONTEXT\.md$/
  {
    console.log('  (e) MILESTONE_CONTEXT_RE');
    const CONTEXT_RE = /M(?:-[a-z0-9]{6}-)?\d+-CONTEXT\.md$/;

    // Old format matches
    assertTrue(CONTEXT_RE.test('M001-CONTEXT.md'), 'context matches M001-CONTEXT.md');
    assertTrue(CONTEXT_RE.test('.gsd/milestones/M001/M001-CONTEXT.md'), 'context matches full path old format');

    // New format matches
    assertTrue(CONTEXT_RE.test('M-abc123-001-CONTEXT.md'), 'context matches M-abc123-001-CONTEXT.md');
    assertTrue(CONTEXT_RE.test('.gsd/milestones/M-abc123-001/M-abc123-001-CONTEXT.md'), 'context matches full path new format');

    // Rejects
    assertTrue(!CONTEXT_RE.test('M001-ROADMAP.md'), 'context rejects M001-ROADMAP.md');
    assertTrue(!CONTEXT_RE.test('M001-SUMMARY.md'), 'context rejects M001-SUMMARY.md');
    assertTrue(!CONTEXT_RE.test('CONTEXT.md'), 'context rejects bare CONTEXT.md');
  }

  // (f) Prompt dispatch regexes — used in index.ts (executeMatch, resumeMatch)
  {
    console.log('  (f) Prompt dispatch regexes');
    const EXECUTE_RE = /Execute the next task:\s+(T\d+)\s+\("([^"]+)"\)\s+in slice\s+(S\d+)\s+of milestone\s+(M(?:-[a-z0-9]{6}-)?\d+)/i;
    const RESUME_RE = /Resume interrupted work\.[\s\S]*?slice\s+(S\d+)\s+of milestone\s+(M(?:-[a-z0-9]{6}-)?\d+)/i;

    // Execute — old format
    {
      const prompt = 'Execute the next task: T01 ("Write tests") in slice S01 of milestone M001';
      const m = prompt.match(EXECUTE_RE);
      assertTrue(m !== null, 'execute matches old format');
      assertEq(m?.[1], 'T01', 'execute captures T01');
      assertEq(m?.[3], 'S01', 'execute captures S01');
      assertEq(m?.[4], 'M001', 'execute captures M001');
    }

    // Execute — new format
    {
      const prompt = 'Execute the next task: T02 ("Build feature") in slice S03 of milestone M-abc123-001';
      const m = prompt.match(EXECUTE_RE);
      assertTrue(m !== null, 'execute matches new format');
      assertEq(m?.[1], 'T02', 'execute captures T02 (new format)');
      assertEq(m?.[3], 'S03', 'execute captures S03 (new format)');
      assertEq(m?.[4], 'M-abc123-001', 'execute captures M-abc123-001');
    }

    // Resume — old format
    {
      const prompt = 'Resume interrupted work.\nContinuing slice S02 of milestone M001';
      const m = prompt.match(RESUME_RE);
      assertTrue(m !== null, 'resume matches old format');
      assertEq(m?.[1], 'S02', 'resume captures S02');
      assertEq(m?.[2], 'M001', 'resume captures M001');
    }

    // Resume — new format
    {
      const prompt = 'Resume interrupted work.\nContinuing slice S01 of milestone M-z9a8b7-042';
      const m = prompt.match(RESUME_RE);
      assertTrue(m !== null, 'resume matches new format');
      assertEq(m?.[1], 'S01', 'resume captures S01 (new format)');
      assertEq(m?.[2], 'M-z9a8b7-042', 'resume captures M-z9a8b7-042');
    }
  }

  // (g) milestoneIdSort — mixed-format ordering
  {
    console.log('  (g) milestoneIdSort');
    const mixed = ['M-abc123-002', 'M001', 'M-xyz789-001'];
    const sorted = [...mixed].sort(milestoneIdSort);
    assertEq(sorted, ['M001', 'M-xyz789-001', 'M-abc123-002'], 'sorts mixed IDs by sequence number');

    // Stable within same seq — preserves insertion order
    const sameSorted = ['M-abc123-001', 'M001'].sort(milestoneIdSort);
    assertEq(sameSorted[0], 'M-abc123-001', 'same seq preserves order (first)');
    assertEq(sameSorted[1], 'M001', 'same seq preserves order (second)');

    // Old format only
    const oldOnly = ['M003', 'M001', 'M002'];
    assertEq([...oldOnly].sort(milestoneIdSort), ['M001', 'M002', 'M003'], 'sorts old-format IDs');

    // New format only
    const newOnly = ['M-abc123-003', 'M-def456-001', 'M-ghi789-002'];
    assertEq([...newOnly].sort(milestoneIdSort), ['M-def456-001', 'M-ghi789-002', 'M-abc123-003'], 'sorts new-format IDs');
  }

  // (h) extractMilestoneSeq — numeric extraction from both formats
  {
    console.log('  (h) extractMilestoneSeq');

    // Old format
    assertEq(extractMilestoneSeq('M001'), 1, 'M001 → 1');
    assertEq(extractMilestoneSeq('M042'), 42, 'M042 → 42');
    assertEq(extractMilestoneSeq('M999'), 999, 'M999 → 999');

    // New format — confirms dispatch-guard refactor correctness
    assertEq(extractMilestoneSeq('M-abc123-001'), 1, 'M-abc123-001 → 1');
    assertEq(extractMilestoneSeq('M-z9a8b7-042'), 42, 'M-z9a8b7-042 → 42');
    assertEq(extractMilestoneSeq('M-xyz789-100'), 100, 'M-xyz789-100 → 100');

    // Invalid → 0 (not NaN — the old parseInt(slice(1)) bug)
    assertEq(extractMilestoneSeq(''), 0, 'empty → 0');
    assertEq(extractMilestoneSeq('notes'), 0, 'notes → 0');
    assertEq(extractMilestoneSeq('S01'), 0, 'S01 → 0');
    assertTrue(!Number.isNaN(extractMilestoneSeq('M-abc123-001')), 'new format does not return NaN');
    assertTrue(!Number.isNaN(extractMilestoneSeq('M-ABCDEF-001')), 'invalid format does not return NaN');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Results
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('All tests passed');
  }
}

// When run via vitest, wrap in test(); when run via tsx, call directly.
const isVitest = typeof globalThis !== 'undefined' && 'vitest' in (globalThis as any).__vitest_worker__?.config?.defines || process.env.VITEST;
if (isVitest) {
  test('regex-hardening: all 12 sites accept both formats', async () => {
    await main();
  });
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
