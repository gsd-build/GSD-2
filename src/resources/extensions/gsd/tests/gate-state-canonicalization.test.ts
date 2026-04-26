// GSD Gate State Canonicalization Tests
// Regression tests for #4950: canonical omitted state and GateVerdict type narrowing.

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  openDatabase,
  closeDatabase,
  insertGateRow,
  markAllGatesOmitted,
  getGateResults,
  getPendingGates,
  insertMilestone,
  insertSlice,
} from "../gsd-db.ts";
import type { GateVerdict } from "../types.ts";

describe("gate-state canonicalization (#4950)", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "gate-canon-test-"));
    dbPath = join(tmpDir, "gsd.db");
    openDatabase(dbPath);
    insertMilestone({ id: "M001", title: "Test Milestone", status: "active" });
    insertSlice({
      milestoneId: "M001",
      id: "S01",
      title: "Test Slice",
      status: "pending",
      risk: "medium",
      depends: [],
    });
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("markAllGatesOmitted produces status=complete, verdict=omitted (not status=omitted)", () => {
    insertGateRow({ milestoneId: "M001", sliceId: "S01", gateId: "Q3", scope: "slice" });
    insertGateRow({ milestoneId: "M001", sliceId: "S01", gateId: "Q4", scope: "slice" });

    markAllGatesOmitted("M001", "S01");

    const all = getGateResults("M001", "S01");
    assert.equal(all.length, 2);
    for (const g of all) {
      assert.equal(g.status, "complete", `expected status=complete for gate ${g.gate_id}`);
      assert.equal(g.verdict, "omitted", `expected verdict=omitted for gate ${g.gate_id}`);
    }
  });

  test("markAllGatesOmitted leaves no pending gates", () => {
    insertGateRow({ milestoneId: "M001", sliceId: "S01", gateId: "Q3", scope: "slice" });
    insertGateRow({ milestoneId: "M001", sliceId: "S01", gateId: "Q4", scope: "slice" });

    markAllGatesOmitted("M001", "S01");

    const pending = getPendingGates("M001", "S01");
    assert.equal(pending.length, 0);
  });

  test("pending gate verdict is null, not empty string", () => {
    insertGateRow({ milestoneId: "M001", sliceId: "S01", gateId: "Q3", scope: "slice" });

    const pending = getPendingGates("M001", "S01");
    assert.equal(pending.length, 1);
    assert.equal(pending[0].verdict, null, "pending gate verdict must be null, not empty string");
  });

  test("complete gate verdict round-trips as a valid GateVerdict (pass/flag/omitted only)", () => {
    insertGateRow({ milestoneId: "M001", sliceId: "S01", gateId: "Q4", scope: "slice" });
    markAllGatesOmitted("M001", "S01");

    const results = getGateResults("M001", "S01");
    const q4 = results.find((g) => g.gate_id === "Q4");
    assert.ok(q4, "Q4 gate must exist");

    const validVerdicts: GateVerdict[] = ["pass", "flag", "omitted"];
    assert.ok(
      q4.verdict !== null && validVerdicts.includes(q4.verdict),
      `verdict "${q4.verdict}" must be one of: ${validVerdicts.join(", ")}`,
    );
  });

  test("empty-string verdict is not reachable after round-trip through DB", () => {
    insertGateRow({ milestoneId: "M001", sliceId: "S01", gateId: "Q3", scope: "slice" });
    markAllGatesOmitted("M001", "S01");

    const results = getGateResults("M001", "S01");
    for (const g of results) {
      assert.notEqual(g.verdict, "", `gate ${g.gate_id} verdict must not be empty string`);
    }
  });
});
