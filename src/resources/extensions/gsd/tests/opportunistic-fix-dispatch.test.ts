/**
 * Tests for opportunistic fix dispatch — DB query, bridge function, and rule ordering.
 *
 * Covers:
 * - gsd-db.ts: getOutstandingTestFailures (positive, negative, edge cases)
 * - manual-test-db.ts: getOutstandingFailures (bridge → ManualTestSession)
 * - auto-dispatch.ts: rule ordering for opportunistic-fix-manual-tests
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  openDatabase,
  closeDatabase,
  insertManualTestSession,
  getOutstandingTestFailures,
  _getAdapter,
} from "../gsd-db.ts";
import { getOutstandingFailures } from "../manual-test-db.ts";
import { getDispatchRuleNames } from "../auto-dispatch.ts";
import type { ManualTestCheck } from "../manual-test.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a ManualTestCheck with sensible defaults. */
function makeCheck(overrides: Partial<ManualTestCheck> & { id: string }): ManualTestCheck {
  return {
    name: overrides.id,
    sliceId: "S01",
    category: "test-case",
    steps: ["Step 1"],
    expected: "Works",
    preconditions: "",
    verdict: null,
    notes: "",
    timestamp: "",
    ...overrides,
  };
}

/** Insert a session with configurable status and failure counts. */
function insertSession(opts: {
  milestoneId: string;
  sliceId?: string | null;
  status?: string;
  failed?: number;
  passed?: number;
  fixPrompt?: string | null;
  checks?: ManualTestCheck[];
}): number {
  const checks = opts.checks ?? [makeCheck({ id: "TC01" })];
  const failed = opts.failed ?? 0;
  const passed = opts.passed ?? 0;
  const total = checks.length;
  const id = insertManualTestSession({
    milestoneId: opts.milestoneId,
    sliceId: opts.sliceId ?? "S01",
    status: opts.status ?? "needs-fix",
    startedAt: new Date().toISOString(),
    completedAt: null,
    totalChecks: total,
    passed,
    failed,
    skipped: total - passed - failed,
    resultsJson: JSON.stringify(checks),
    snapshotJson: JSON.stringify({ phase: "test", milestoneProgress: "1/3", slicesComplete: [] }),
  });

  // If fixPrompt is explicitly provided, set it via raw SQL
  if (opts.fixPrompt !== undefined && opts.fixPrompt !== null) {
    const adapter = _getAdapter()!;
    adapter.prepare("UPDATE manual_test_sessions SET fix_prompt = :prompt WHERE id = :id").run({
      ":prompt": opts.fixPrompt,
      ":id": id,
    });
  }

  return id;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Group 1: DB Query — getOutstandingTestFailures
// ═══════════════════════════════════════════════════════════════════════════════

describe("getOutstandingTestFailures", () => {
  beforeEach(() => {
    openDatabase(":memory:");
  });
  afterEach(() => {
    closeDatabase();
  });

  test("returns row when session has failed > 0 and fix_prompt IS NULL", () => {
    const checks = [
      makeCheck({ id: "TC01", verdict: "pass" }),
      makeCheck({ id: "TC02", verdict: "fail" }),
    ];
    insertSession({ milestoneId: "M001", failed: 1, passed: 1, checks });

    const row = getOutstandingTestFailures("M001");
    assert.ok(row, "should find a row with outstanding failures");
    assert.equal(row!.milestone_id, "M001");
    assert.equal(row!.failed, 1);
    assert.equal(row!.fix_prompt, null);
  });

  test("returns null when no sessions exist", () => {
    const row = getOutstandingTestFailures("M001");
    assert.equal(row, null, "empty DB should return null");
  });

  test("returns null when session has failed = 0", () => {
    const checks = [makeCheck({ id: "TC01", verdict: "pass" })];
    insertSession({ milestoneId: "M001", failed: 0, passed: 1, checks });

    const row = getOutstandingTestFailures("M001");
    assert.equal(row, null, "zero failures should return null");
  });

  test("returns null when session has fix_prompt already set", () => {
    const checks = [makeCheck({ id: "TC01", verdict: "fail" })];
    insertSession({
      milestoneId: "M001",
      failed: 1,
      passed: 0,
      checks,
      fixPrompt: "Please fix the failing tests",
    });

    const row = getOutstandingTestFailures("M001");
    assert.equal(row, null, "session with fix_prompt set should be excluded");
  });

  test("returns latest session when multiple exist (ORDER BY id DESC)", () => {
    const oldChecks = [makeCheck({ id: "TC01", verdict: "fail" })];
    insertSession({ milestoneId: "M001", failed: 1, checks: oldChecks });

    const newChecks = [
      makeCheck({ id: "TC01", verdict: "fail" }),
      makeCheck({ id: "TC02", verdict: "fail" }),
    ];
    const newId = insertSession({ milestoneId: "M001", failed: 2, checks: newChecks });

    const row = getOutstandingTestFailures("M001");
    assert.ok(row, "should return a row");
    assert.equal(row!.id, newId, "should return the latest session (highest id)");
    assert.equal(row!.failed, 2);
  });

  test("cross-milestone isolation — session in M002 not returned for M001", () => {
    const checks = [makeCheck({ id: "TC01", verdict: "fail" })];
    insertSession({ milestoneId: "M002", failed: 1, checks });

    const row = getOutstandingTestFailures("M001");
    assert.equal(row, null, "M002 session should not appear for M001 query");
  });

  test("returns null when DB is not open", () => {
    closeDatabase();
    const row = getOutstandingTestFailures("M001");
    assert.equal(row, null, "closed DB should return null");
    // Re-open for afterEach cleanup
    openDatabase(":memory:");
  });

  test("session with failed > 0 but complete status is excluded (prevents dispatch loop)", () => {
    // Sessions marked complete (e.g., user chose "Accept as-is") must not trigger
    // opportunistic dispatch — the status filter prevents infinite dispatch loops
    const checks = [makeCheck({ id: "TC01", verdict: "fail" })];
    insertSession({ milestoneId: "M001", status: "complete", failed: 1, checks });

    const row = getOutstandingTestFailures("M001");
    assert.equal(row, null, "complete session with failures should NOT be returned");
  });

  test("session with needs-fix status and failures is returned", () => {
    const checks = [makeCheck({ id: "TC01", verdict: "fail" })];
    insertSession({ milestoneId: "M001", status: "needs-fix", failed: 1, checks });

    const row = getOutstandingTestFailures("M001");
    assert.ok(row, "needs-fix session with failures should be returned");
    assert.equal(row!.failed, 1);
  });

  test("session with in-progress status and failures is returned", () => {
    const checks = [makeCheck({ id: "TC01", verdict: "fail" })];
    insertSession({ milestoneId: "M001", status: "in-progress", failed: 1, checks });

    const row = getOutstandingTestFailures("M001");
    assert.ok(row, "in-progress session with failures should be returned");
    assert.equal(row!.failed, 1);
  });

  test("skips sessions where all checks passed even if total is high", () => {
    const checks = [
      makeCheck({ id: "TC01", verdict: "pass" }),
      makeCheck({ id: "TC02", verdict: "pass" }),
      makeCheck({ id: "TC03", verdict: "pass" }),
    ];
    insertSession({ milestoneId: "M001", failed: 0, passed: 3, checks });

    const row = getOutstandingTestFailures("M001");
    assert.equal(row, null, "all-passing session should return null");
  });

  test("results_json is correctly stored and retrievable", () => {
    const checks = [
      makeCheck({ id: "TC01", verdict: "fail", notes: "Login broken" }),
      makeCheck({ id: "TC02", verdict: "pass" }),
    ];
    insertSession({ milestoneId: "M001", failed: 1, passed: 1, checks });

    const row = getOutstandingTestFailures("M001");
    assert.ok(row);
    const parsed = JSON.parse(row!.results_json!);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].verdict, "fail");
    assert.equal(parsed[0].notes, "Login broken");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group 2: Bridge Function — getOutstandingFailures
// ═══════════════════════════════════════════════════════════════════════════════

describe("getOutstandingFailures", () => {
  beforeEach(() => {
    openDatabase(":memory:");
  });
  afterEach(() => {
    closeDatabase();
  });

  test("returns ManualTestSession with parsed checks when outstanding failures exist", () => {
    const checks = [
      makeCheck({ id: "TC01", verdict: "fail", notes: "Broken button" }),
      makeCheck({ id: "TC02", verdict: "pass" }),
    ];
    insertSession({ milestoneId: "M001", failed: 1, passed: 1, checks });

    const session = getOutstandingFailures("M001");
    assert.ok(session, "should return a ManualTestSession");
    assert.equal(session!.milestoneId, "M001");
    assert.equal(session!.sliceId, "S01");
    assert.ok(Array.isArray(session!.checks), "checks should be an array");
    assert.equal(session!.checks.length, 2);
    assert.equal(session!.checks[0].verdict, "fail");
    assert.equal(session!.checks[0].notes, "Broken button");
    assert.equal(session!.checks[1].verdict, "pass");
    assert.ok(session!.id, "session should have a numeric id");
    assert.ok(session!.startedAt, "session should have startedAt");
  });

  test("returns null when no outstanding failures exist", () => {
    const checks = [makeCheck({ id: "TC01", verdict: "pass" })];
    insertSession({ milestoneId: "M001", failed: 0, passed: 1, checks });

    const session = getOutstandingFailures("M001");
    assert.equal(session, null, "no failures → null");
  });

  test("returns null when fix_prompt already set", () => {
    const checks = [makeCheck({ id: "TC01", verdict: "fail" })];
    insertSession({
      milestoneId: "M001",
      failed: 1,
      checks,
      fixPrompt: "Fix these tests",
    });

    const session = getOutstandingFailures("M001");
    assert.equal(session, null, "fix_prompt set → already dispatched → null");
  });

  test("returns null when DB is not open", () => {
    closeDatabase();
    const session = getOutstandingFailures("M001");
    assert.equal(session, null, "closed DB → null via isDbAvailable guard");
    openDatabase(":memory:");
  });

  test("snapshot fields are parsed from snapshot_json", () => {
    const checks = [makeCheck({ id: "TC01", verdict: "fail" })];
    insertSession({ milestoneId: "M001", failed: 1, checks });

    const session = getOutstandingFailures("M001");
    assert.ok(session);
    assert.ok(session!.snapshot, "snapshot should be present");
    assert.equal(session!.snapshot.phase, "test");
    assert.equal(session!.snapshot.milestoneProgress, "1/3");
    assert.deepEqual(session!.snapshot.slicesComplete, []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group 3: Dispatch Rule Ordering
// ═══════════════════════════════════════════════════════════════════════════════

describe("dispatch rule ordering", () => {
  test("getDispatchRuleNames contains opportunistic-fix-manual-tests rule", () => {
    const names = getDispatchRuleNames();
    const hasRule = names.some((n) => n.includes("opportunistic-fix-manual-tests"));
    assert.ok(hasRule, `rule list should contain opportunistic-fix-manual-tests, got: ${names.join(", ")}`);
  });

  test("opportunistic rule appears after fix-manual-tests and before summarizing → complete-slice", () => {
    const names = getDispatchRuleNames();
    const fixIdx = names.findIndex((n) => n.includes("fix-manual-tests") && !n.includes("opportunistic"));
    const oppIdx = names.findIndex((n) => n.includes("opportunistic-fix-manual-tests"));
    const summIdx = names.findIndex((n) => n.includes("summarizing → complete-slice"));

    assert.ok(fixIdx >= 0, "fix-manual-tests rule should exist");
    assert.ok(oppIdx >= 0, "opportunistic-fix-manual-tests rule should exist");
    assert.ok(summIdx >= 0, "summarizing → complete-slice rule should exist");

    assert.ok(
      oppIdx > fixIdx,
      `opportunistic (idx ${oppIdx}) should come after fix-manual-tests (idx ${fixIdx})`,
    );
    assert.ok(
      oppIdx < summIdx,
      `opportunistic (idx ${oppIdx}) should come before summarizing → complete-slice (idx ${summIdx})`,
    );
  });
});
