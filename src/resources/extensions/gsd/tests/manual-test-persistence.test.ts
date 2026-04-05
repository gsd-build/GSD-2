/**
 * Tests for incremental persistence, resume detection, and check merging.
 *
 * Covers:
 * - gsd-db.ts: updateManualTestSessionResults, getInProgressSessionRow
 * - commands-manual-test.ts: mergeChecks
 * - Resume flow integration: in-progress session → merge → correct startIndex
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  openDatabase,
  closeDatabase,
  insertManualTestSession,
  updateManualTestSessionResults,
  getInProgressSessionRow,
  _getAdapter,
} from "../gsd-db.ts";
import { mergeChecks } from "../commands-manual-test.ts";
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

/** Insert a basic in-progress session and return its row ID. */
function insertInProgressSession(
  milestoneId: string,
  sliceId: string | null,
  checks: ManualTestCheck[],
): number {
  return insertManualTestSession({
    milestoneId,
    sliceId,
    status: "in-progress",
    startedAt: new Date().toISOString(),
    completedAt: null,
    totalChecks: checks.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    resultsJson: JSON.stringify(checks),
    snapshotJson: JSON.stringify({ phase: "test", milestoneProgress: "1/3", slicesComplete: [] }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Group 1: DB Functions
// ═══════════════════════════════════════════════════════════════════════════════

describe("updateManualTestSessionResults", () => {
  beforeEach(() => {
    openDatabase(":memory:");
  });

  afterEach(() => {
    closeDatabase();
  });

  test("updates results_json and counts on an existing row", () => {
    const checks = [makeCheck({ id: "S01-TC01" }), makeCheck({ id: "S01-TC02" })];
    const id = insertInProgressSession("M001", "S01", checks);
    assert.ok(id > 0, "session should be inserted");

    // Now update with verdicts
    const updatedChecks = [
      makeCheck({ id: "S01-TC01", verdict: "pass", notes: "", timestamp: "2026-01-01T00:00:00Z" }),
      makeCheck({ id: "S01-TC02", verdict: "fail", notes: "Broken", timestamp: "2026-01-01T00:01:00Z" }),
    ];
    updateManualTestSessionResults(id, JSON.stringify(updatedChecks), 2, 1, 1, 0);

    // Verify by reading the row directly
    const adapter = _getAdapter()!;
    const row = adapter.prepare("SELECT * FROM manual_test_sessions WHERE id = ?").get(id) as Record<string, unknown>;
    assert.equal(row["total_checks"], 2);
    assert.equal(row["passed"], 1);
    assert.equal(row["failed"], 1);
    assert.equal(row["skipped"], 0);

    const storedChecks = JSON.parse(row["results_json"] as string);
    assert.equal(storedChecks[0].verdict, "pass");
    assert.equal(storedChecks[1].verdict, "fail");
    assert.equal(storedChecks[1].notes, "Broken");
  });

  test("no-ops silently for non-existent ID", () => {
    // Should not throw
    updateManualTestSessionResults(99999, JSON.stringify([]), 0, 0, 0, 0);

    // Verify nothing was inserted
    const adapter = _getAdapter()!;
    const row = adapter.prepare("SELECT count(*) as cnt FROM manual_test_sessions").get() as Record<string, unknown>;
    assert.equal(row["cnt"], 0);
  });
});

describe("getInProgressSessionRow", () => {
  beforeEach(() => {
    openDatabase(":memory:");
  });

  afterEach(() => {
    closeDatabase();
  });

  test("returns the latest in-progress session matching milestone+slice", () => {
    const checks = [makeCheck({ id: "S01-TC01" })];
    // Insert two in-progress sessions — should return the latest (highest id)
    insertInProgressSession("M001", "S01", []);
    const id2 = insertInProgressSession("M001", "S01", checks);

    const row = getInProgressSessionRow("M001", "S01");
    assert.ok(row, "should find a row");
    assert.equal(row!.id, id2, "should return the latest session");
    assert.equal(row!.milestone_id, "M001");
    assert.equal(row!.slice_id, "S01");
    assert.equal(row!.status, "in-progress");
  });

  test("returns null when no in-progress session exists", () => {
    const row = getInProgressSessionRow("M001", "S01");
    assert.equal(row, null);
  });

  test("ignores completed sessions", () => {
    // Insert a completed session
    insertManualTestSession({
      milestoneId: "M001",
      sliceId: "S01",
      status: "complete",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      totalChecks: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      resultsJson: JSON.stringify([makeCheck({ id: "S01-TC01", verdict: "pass" })]),
      snapshotJson: "{}",
    });

    const row = getInProgressSessionRow("M001", "S01");
    assert.equal(row, null, "should not return completed sessions");
  });

  test("ignores abandoned sessions", () => {
    insertManualTestSession({
      milestoneId: "M001",
      sliceId: "S01",
      status: "abandoned",
      startedAt: new Date().toISOString(),
      completedAt: null,
      totalChecks: 2,
      passed: 0,
      failed: 0,
      skipped: 0,
      resultsJson: "[]",
      snapshotJson: "{}",
    });

    const row = getInProgressSessionRow("M001", "S01");
    assert.equal(row, null, "should not return abandoned sessions");
  });

  test("matches null sliceId correctly (all mode)", () => {
    // Insert session with null sliceId
    const id = insertInProgressSession("M001", null, [makeCheck({ id: "S01-TC01" })]);

    // Query with null sliceId
    const row = getInProgressSessionRow("M001", null);
    assert.ok(row, "should find null-sliceId session");
    assert.equal(row!.id, id);
    assert.equal(row!.slice_id, null);

    // Query with a specific sliceId should NOT match the null-sliceId session
    const otherRow = getInProgressSessionRow("M001", "S01");
    assert.equal(otherRow, null, "specific sliceId should not match null-sliceId session");
  });

  test("does not cross-match milestone IDs", () => {
    insertInProgressSession("M002", "S01", [makeCheck({ id: "S01-TC01" })]);

    const row = getInProgressSessionRow("M001", "S01");
    assert.equal(row, null, "should not match different milestone");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group 2: Check Merging (mergeChecks)
// ═══════════════════════════════════════════════════════════════════════════════

describe("mergeChecks", () => {
  test("matching checks: verdicts transfer from persisted to fresh by check.id", () => {
    const persisted = [
      makeCheck({ id: "S01-TC01", verdict: "pass", notes: "Looks good", timestamp: "2026-01-01T00:00:00Z" }),
      makeCheck({ id: "S01-TC02", verdict: "fail", notes: "Broken button", timestamp: "2026-01-01T00:01:00Z" }),
    ];
    const fresh = [
      makeCheck({ id: "S01-TC01" }),
      makeCheck({ id: "S01-TC02" }),
    ];

    const merged = mergeChecks(fresh, persisted);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].verdict, "pass");
    assert.equal(merged[0].notes, "Looks good");
    assert.equal(merged[0].timestamp, "2026-01-01T00:00:00Z");
    assert.equal(merged[1].verdict, "fail");
    assert.equal(merged[1].notes, "Broken button");
  });

  test("new checks in fresh set get null verdicts", () => {
    const persisted = [
      makeCheck({ id: "S01-TC01", verdict: "pass", timestamp: "2026-01-01T00:00:00Z" }),
    ];
    const fresh = [
      makeCheck({ id: "S01-TC01" }),
      makeCheck({ id: "S01-TC03" }),  // new check not in persisted
    ];

    const merged = mergeChecks(fresh, persisted);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].verdict, "pass", "existing check should have verdict");
    assert.equal(merged[1].verdict, null, "new check should have null verdict");
    assert.equal(merged[1].id, "S01-TC03");
  });

  test("removed checks (in persisted but not in fresh) are dropped", () => {
    const persisted = [
      makeCheck({ id: "S01-TC01", verdict: "pass", timestamp: "2026-01-01T00:00:00Z" }),
      makeCheck({ id: "S01-TC02", verdict: "fail", timestamp: "2026-01-01T00:01:00Z" }),
    ];
    const fresh = [
      makeCheck({ id: "S01-TC01" }),
      // S01-TC02 is gone from fresh — should be dropped
    ];

    const merged = mergeChecks(fresh, persisted);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, "S01-TC01");
    assert.equal(merged[0].verdict, "pass");
  });

  test("mixed scenario: some matched, some new, some removed", () => {
    const persisted = [
      makeCheck({ id: "S01-TC01", verdict: "pass", notes: "OK", timestamp: "2026-01-01T00:00:00Z" }),
      makeCheck({ id: "S01-TC02", verdict: "fail", notes: "Bad", timestamp: "2026-01-01T00:01:00Z" }),
      makeCheck({ id: "S01-TC03", verdict: "skip", notes: "N/A", timestamp: "2026-01-01T00:02:00Z" }),
    ];
    const fresh = [
      makeCheck({ id: "S01-TC01" }),  // matched — gets persisted verdict
      makeCheck({ id: "S01-TC03" }),  // matched — gets persisted verdict
      makeCheck({ id: "S01-TC04" }),  // new — stays null
      // S01-TC02 is removed — dropped from result
    ];

    const merged = mergeChecks(fresh, persisted);
    assert.equal(merged.length, 3);
    assert.equal(merged[0].id, "S01-TC01");
    assert.equal(merged[0].verdict, "pass");
    assert.equal(merged[1].id, "S01-TC03");
    assert.equal(merged[1].verdict, "skip");
    assert.equal(merged[2].id, "S01-TC04");
    assert.equal(merged[2].verdict, null);
  });

  test("verdict fields (verdict, notes, timestamp) all transfer correctly", () => {
    const persisted = [
      makeCheck({
        id: "S01-TC01",
        verdict: "fail",
        notes: "Button doesn't respond to clicks",
        timestamp: "2026-03-15T14:30:00Z",
      }),
    ];
    const fresh = [
      makeCheck({
        id: "S01-TC01",
        name: "Updated Check Name",  // fresh may have different name/steps
        steps: ["New step 1", "New step 2"],
        expected: "New expected result",
      }),
    ];

    const merged = mergeChecks(fresh, persisted);
    assert.equal(merged.length, 1);
    // Verdict fields come from persisted
    assert.equal(merged[0].verdict, "fail");
    assert.equal(merged[0].notes, "Button doesn't respond to clicks");
    assert.equal(merged[0].timestamp, "2026-03-15T14:30:00Z");
    // Non-verdict fields come from fresh
    assert.equal(merged[0].name, "Updated Check Name");
    assert.deepEqual(merged[0].steps, ["New step 1", "New step 2"]);
    assert.equal(merged[0].expected, "New expected result");
  });

  test("empty fresh checks returns empty array", () => {
    const persisted = [
      makeCheck({ id: "S01-TC01", verdict: "pass", timestamp: "2026-01-01T00:00:00Z" }),
    ];
    const merged = mergeChecks([], persisted);
    assert.equal(merged.length, 0);
  });

  test("empty persisted checks returns fresh checks unchanged", () => {
    const fresh = [
      makeCheck({ id: "S01-TC01" }),
      makeCheck({ id: "S01-TC02" }),
    ];
    const merged = mergeChecks(fresh, []);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].verdict, null);
    assert.equal(merged[1].verdict, null);
  });

  test("all checks already judged — startIndex equals length", () => {
    const persisted = [
      makeCheck({ id: "S01-TC01", verdict: "pass", timestamp: "2026-01-01T00:00:00Z" }),
      makeCheck({ id: "S01-TC02", verdict: "fail", timestamp: "2026-01-01T00:01:00Z" }),
    ];
    const fresh = [
      makeCheck({ id: "S01-TC01" }),
      makeCheck({ id: "S01-TC02" }),
    ];

    const merged = mergeChecks(fresh, persisted);
    const startIndex = merged.findIndex((c) => c.verdict === null);
    // When all judged, findIndex returns -1 (which the handler treats as "restart from 0")
    assert.equal(startIndex, -1, "no unjudged checks → findIndex returns -1");
  });

  test("persisted checks with null verdict are not transferred", () => {
    // If a persisted check has null verdict (unjudged), it should NOT override fresh
    const persisted = [
      makeCheck({ id: "S01-TC01", verdict: null }),  // unjudged persisted
    ];
    const fresh = [
      makeCheck({ id: "S01-TC01" }),
    ];

    const merged = mergeChecks(fresh, persisted);
    assert.equal(merged[0].verdict, null, "null-verdict persisted should not transfer");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group 3: Resume Flow Integration
// ═══════════════════════════════════════════════════════════════════════════════

describe("resume flow integration", () => {
  beforeEach(() => {
    openDatabase(":memory:");
  });

  afterEach(() => {
    closeDatabase();
  });

  test("in-progress session → merge with fresh checks → correct startIndex", () => {
    // Simulate: user judged 2 of 4 checks, then quit
    const persistedChecks = [
      makeCheck({ id: "S01-smoke", verdict: "pass", notes: "", timestamp: "2026-01-01T00:00:00Z" }),
      makeCheck({ id: "S01-TC01", verdict: "fail", notes: "Error shown", timestamp: "2026-01-01T00:01:00Z" }),
      makeCheck({ id: "S01-TC02" }),  // unjudged
      makeCheck({ id: "S01-TC03" }),  // unjudged
    ];

    const sessionId = insertInProgressSession("M001", "S01", persistedChecks);
    assert.ok(sessionId > 0, "session should be inserted");

    // Simulate: on resume, fresh checks are regenerated (may differ)
    const freshChecks = [
      makeCheck({ id: "S01-smoke", name: "Smoke Test (updated)" }),
      makeCheck({ id: "S01-TC01", name: "Test Case 1 (updated)" }),
      makeCheck({ id: "S01-TC02" }),
      makeCheck({ id: "S01-TC03" }),
      makeCheck({ id: "S01-TC04" }),  // new check added since last run
    ];

    // Step 1: load the in-progress session from DB
    const row = getInProgressSessionRow("M001", "S01");
    assert.ok(row, "should find in-progress session");

    // Step 2: parse persisted checks from DB row
    const dbChecks: ManualTestCheck[] = JSON.parse(row!.results_json!);
    assert.equal(dbChecks.length, 4);

    // Step 3: merge
    const merged = mergeChecks(freshChecks, dbChecks);
    assert.equal(merged.length, 5, "merged should have all fresh checks");

    // Verdicts from first two should transfer
    assert.equal(merged[0].verdict, "pass");
    assert.equal(merged[1].verdict, "fail");
    assert.equal(merged[1].notes, "Error shown");

    // Unjudged checks should be null
    assert.equal(merged[2].verdict, null);
    assert.equal(merged[3].verdict, null);
    assert.equal(merged[4].verdict, null);  // new check

    // Step 4: startIndex should point to first null-verdict check
    const startIndex = merged.findIndex((c) => c.verdict === null);
    assert.equal(startIndex, 2, "should start at index 2 (third check)");

    // Fresh metadata should be preserved
    assert.equal(merged[0].name, "Smoke Test (updated)");
    assert.equal(merged[1].name, "Test Case 1 (updated)");
  });

  test("merged session preserves the original DB row ID", () => {
    const checks = [makeCheck({ id: "S01-TC01", verdict: "pass", timestamp: "2026-01-01T00:00:00Z" })];
    const sessionId = insertInProgressSession("M001", "S01", checks);

    const row = getInProgressSessionRow("M001", "S01");
    assert.ok(row);
    assert.equal(row!.id, sessionId, "DB row ID should be the same as the inserted session ID");
  });

  test("resume with all checks already judged → findIndex returns -1", () => {
    const persistedChecks = [
      makeCheck({ id: "S01-TC01", verdict: "pass", timestamp: "2026-01-01T00:00:00Z" }),
      makeCheck({ id: "S01-TC02", verdict: "skip", timestamp: "2026-01-01T00:01:00Z" }),
    ];

    insertInProgressSession("M001", "S01", persistedChecks);

    const freshChecks = [
      makeCheck({ id: "S01-TC01" }),
      makeCheck({ id: "S01-TC02" }),
    ];

    const row = getInProgressSessionRow("M001", "S01");
    const dbChecks: ManualTestCheck[] = JSON.parse(row!.results_json!);
    const merged = mergeChecks(freshChecks, dbChecks);

    const startIndex = merged.findIndex((c) => c.verdict === null);
    assert.equal(startIndex, -1, "all judged → -1 (handler resets to 0)");
  });

  test("no in-progress session → getInProgressSessionRow returns null → new session path", () => {
    // Only completed sessions exist
    insertManualTestSession({
      milestoneId: "M001",
      sliceId: "S01",
      status: "complete",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      totalChecks: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      resultsJson: JSON.stringify([makeCheck({ id: "S01-TC01", verdict: "pass" })]),
      snapshotJson: "{}",
    });

    const row = getInProgressSessionRow("M001", "S01");
    assert.equal(row, null, "no in-progress session → null → handler creates new session");
  });
});
