// Tests for unique milestone ID exports from T01/S01 — covers the S01→S02 boundary contract.
//
// Sections:
//   (a) MILESTONE_ID_RE: regex matching/rejection
//   (b) extractMilestoneSeq: old/new/invalid → number
//   (c) parseMilestoneId: old/new/invalid → structured result
//   (d) milestoneIdSort: ordering of mixed arrays
//   (e) generateMilestonePrefix: format, length, uniqueness
//   (f) nextMilestoneId: uniqueEnabled true/false, mixed arrays
//   (g) maxMilestoneNum: empty, old, new, mixed, non-matching
//   (h) Preferences round-trip: validate, merge behavior via renderPreferencesForSystemPrompt

import {
  MILESTONE_ID_RE,
  extractMilestoneSeq,
  parseMilestoneId,
  milestoneIdSort,
  generateMilestonePrefix,
  nextMilestoneId,
  maxMilestoneNum,
} from '../guided-flow.ts';

import { renderPreferencesForSystemPrompt } from '../preferences.ts';
import type { GSDPreferences } from '../preferences.ts';

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

// ─── Tests ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('unique-milestone-ids tests');

  // (a) MILESTONE_ID_RE
  {
    console.log('  (a) MILESTONE_ID_RE');
    // Should match
    assertTrue(MILESTONE_ID_RE.test('M001'), 'matches M001');
    assertTrue(MILESTONE_ID_RE.test('M999'), 'matches M999');
    assertTrue(MILESTONE_ID_RE.test('M-abc123-001'), 'matches M-abc123-001');
    assertTrue(MILESTONE_ID_RE.test('M-z9a8b7-042'), 'matches M-z9a8b7-042');

    // Should reject
    assertTrue(!MILESTONE_ID_RE.test('M1'), 'rejects M1 (too few digits)');
    assertTrue(!MILESTONE_ID_RE.test('M0001'), 'rejects M0001 (too many digits)');
    assertTrue(!MILESTONE_ID_RE.test('M-ABC-001'), 'rejects M-ABC-001 (wrong length prefix)');
    assertTrue(!MILESTONE_ID_RE.test('M-ABCDEF-001'), 'rejects M-ABCDEF-001 (uppercase prefix)');
    assertTrue(!MILESTONE_ID_RE.test('M-short-001'), 'rejects M-short-001 (5-char prefix)');
    assertTrue(!MILESTONE_ID_RE.test('M-toolong1-001'), 'rejects M-toolong1-001 (>6-char prefix)');
    assertTrue(!MILESTONE_ID_RE.test('IM001'), 'rejects IM001 (prefix before M)');
    assertTrue(!MILESTONE_ID_RE.test(''), 'rejects empty string');
    assertTrue(!MILESTONE_ID_RE.test('M001extra'), 'rejects M001extra (trailing chars)');
    assertTrue(!MILESTONE_ID_RE.test('notes'), 'rejects non-milestone string');
  }

  // (b) extractMilestoneSeq
  {
    console.log('  (b) extractMilestoneSeq');
    // Old format
    assertEq(extractMilestoneSeq('M001'), 1, 'M001 → 1');
    assertEq(extractMilestoneSeq('M042'), 42, 'M042 → 42');
    assertEq(extractMilestoneSeq('M999'), 999, 'M999 → 999');

    // New format
    assertEq(extractMilestoneSeq('M-abc123-001'), 1, 'M-abc123-001 → 1');
    assertEq(extractMilestoneSeq('M-z9a8b7-042'), 42, 'M-z9a8b7-042 → 42');

    // Invalid → 0
    assertEq(extractMilestoneSeq(''), 0, 'empty → 0');
    assertEq(extractMilestoneSeq('notes'), 0, 'notes → 0');
    assertEq(extractMilestoneSeq('M1'), 0, 'M1 → 0');
    assertEq(extractMilestoneSeq('.DS_Store'), 0, '.DS_Store → 0');
    assertEq(extractMilestoneSeq('M-ABC-001'), 0, 'M-ABC-001 (wrong length) → 0');
  }

  // (c) parseMilestoneId
  {
    console.log('  (c) parseMilestoneId');
    // Old format — no prefix
    assertEq(parseMilestoneId('M001'), { num: 1 }, 'M001 → { num: 1 }');
    assertEq(parseMilestoneId('M042'), { num: 42 }, 'M042 → { num: 42 }');

    // New format — with prefix
    assertEq(parseMilestoneId('M-abc123-001'), { prefix: 'abc123', num: 1 }, 'M-abc123-001 → { prefix, num }');
    assertEq(parseMilestoneId('M-z9a8b7-042'), { prefix: 'z9a8b7', num: 42 }, 'M-z9a8b7-042 → { prefix, num }');

    // Invalid → { num: 0 }
    assertEq(parseMilestoneId(''), { num: 0 }, 'empty → { num: 0 }');
    assertEq(parseMilestoneId('notes'), { num: 0 }, 'notes → { num: 0 }');
    assertEq(parseMilestoneId('M-ABCDEF-001'), { num: 0 }, 'uppercase prefix → { num: 0 }');
    assertEq(parseMilestoneId('M1'), { num: 0 }, 'M1 → { num: 0 }');
  }

  // (d) milestoneIdSort
  {
    console.log('  (d) milestoneIdSort');
    const mixed = ['M-abc123-003', 'M001', 'M-z9a8b7-002'];
    const sorted = [...mixed].sort(milestoneIdSort);
    assertEq(sorted, ['M001', 'M-z9a8b7-002', 'M-abc123-003'], 'sorts mixed IDs by sequence number');

    // All old format
    const oldOnly = ['M003', 'M001', 'M002'];
    assertEq([...oldOnly].sort(milestoneIdSort), ['M001', 'M002', 'M003'], 'sorts old-format IDs');

    // Invalid entries sort to front (seq 0)
    const withInvalid = ['M002', 'notes', 'M001'];
    assertEq([...withInvalid].sort(milestoneIdSort), ['notes', 'M001', 'M002'], 'invalid entries (seq 0) sort first');
  }

  // (e) generateMilestonePrefix
  {
    console.log('  (e) generateMilestonePrefix');
    const prefix1 = generateMilestonePrefix();
    assertEq(prefix1.length, 6, 'prefix length is 6');
    assertMatch(prefix1, /^[a-z0-9]{6}$/, 'prefix matches [a-z0-9]{6}');

    const prefix2 = generateMilestonePrefix();
    assertEq(prefix2.length, 6, 'second prefix length is 6');
    assertMatch(prefix2, /^[a-z0-9]{6}$/, 'second prefix matches [a-z0-9]{6}');

    // Two calls should produce different results (36^6 = ~2.2B possibilities)
    assertTrue(prefix1 !== prefix2, 'two calls produce different prefixes');
  }

  // (f) nextMilestoneId
  {
    console.log('  (f) nextMilestoneId');
    // uniqueEnabled=false (default) → old format
    assertEq(nextMilestoneId([]), 'M001', 'empty + uniqueEnabled=false → M001');
    assertEq(nextMilestoneId(['M001', 'M002']), 'M003', 'sequential + uniqueEnabled=false → M003');
    assertEq(nextMilestoneId(['M001', 'M002'], false), 'M003', 'explicit false → M003');

    // uniqueEnabled=true → new format
    const newId = nextMilestoneId([], true);
    assertMatch(newId, MILESTONE_ID_RE, 'uniqueEnabled=true produces valid ID');
    assertTrue(newId.startsWith('M-'), 'uniqueEnabled=true starts with M-');
    assertTrue(newId.endsWith('-001'), 'empty + uniqueEnabled=true ends with -001');

    // Mixed array with uniqueEnabled=true
    const mixedIds = ['M001', 'M-abc123-003', 'M002'];
    const nextNew = nextMilestoneId(mixedIds, true);
    assertMatch(nextNew, MILESTONE_ID_RE, 'mixed array + uniqueEnabled=true → valid ID');
    assertTrue(nextNew.endsWith('-004'), 'mixed array max=3 → seq 004');

    // Mixed array with uniqueEnabled=false
    assertEq(nextMilestoneId(mixedIds, false), 'M004', 'mixed array + uniqueEnabled=false → M004');

    // Correct sequential number from mixed arrays
    const mixedIds2 = ['M-xyz999-005', 'M002'];
    assertEq(nextMilestoneId(mixedIds2, false), 'M006', 'mixed max=5 → M006');
    const nextNew2 = nextMilestoneId(mixedIds2, true);
    assertTrue(nextNew2.endsWith('-006'), 'mixed max=5 + unique → seq 006');
  }

  // (g) maxMilestoneNum
  {
    console.log('  (g) maxMilestoneNum');
    // Empty
    assertEq(maxMilestoneNum([]), 0, 'empty → 0');

    // Old format only
    assertEq(maxMilestoneNum(['M001', 'M002', 'M003']), 3, 'old format only → 3');

    // New format only — must not return NaN
    assertEq(maxMilestoneNum(['M-abc123-001', 'M-def456-002']), 2, 'new format only → 2');
    assertTrue(!Number.isNaN(maxMilestoneNum(['M-abc123-001'])), 'new format does not return NaN');

    // Mixed formats
    assertEq(maxMilestoneNum(['M001', 'M-abc123-003', 'M002']), 3, 'mixed → 3');

    // Non-matching entries ignored
    assertEq(maxMilestoneNum(['M001', 'notes', '.DS_Store', 'M003']), 3, 'non-matching ignored → 3');
    assertEq(maxMilestoneNum(['notes', '.DS_Store']), 0, 'all non-matching → 0');
  }

  // (h) Preferences round-trip via renderPreferencesForSystemPrompt
  {
    console.log('  (h) Preferences round-trip');

    // validate { unique_milestone_ids: true } → field preserved (no validation error)
    const prefsTrue: GSDPreferences = { unique_milestone_ids: true };
    const renderedTrue = renderPreferencesForSystemPrompt(prefsTrue);
    assertTrue(!renderedTrue.includes('some preference values were ignored'), 'unique_milestone_ids: true validates without error');

    // validate { unique_milestone_ids: undefined } → field absent (no error)
    const prefsUndefined: GSDPreferences = {};
    const renderedUndefined = renderPreferencesForSystemPrompt(prefsUndefined);
    assertTrue(!renderedUndefined.includes('some preference values were ignored'), 'undefined unique_milestone_ids validates without error');

    // validate { unique_milestone_ids: false } → also valid
    const prefsFalse: GSDPreferences = { unique_milestone_ids: false };
    const renderedFalse = renderPreferencesForSystemPrompt(prefsFalse);
    assertTrue(!renderedFalse.includes('some preference values were ignored'), 'unique_milestone_ids: false validates without error');

    // validate coercion: truthy non-boolean → coerced to boolean (no crash)
    const prefsCoerced: GSDPreferences = { unique_milestone_ids: 1 as unknown as boolean };
    const renderedCoerced = renderPreferencesForSystemPrompt(prefsCoerced);
    assertTrue(!renderedCoerced.includes('some preference values were ignored'), 'truthy non-boolean coerces without validation error');

    // GSDPreferences interface accepts the field (compile-time check — if this compiles, it works)
    const prefs: GSDPreferences = { unique_milestone_ids: true, version: 1 };
    assertTrue(prefs.unique_milestone_ids === true, 'GSDPreferences interface accepts unique_milestone_ids');
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
