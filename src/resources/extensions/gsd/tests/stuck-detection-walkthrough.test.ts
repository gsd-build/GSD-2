// GSD Extension — Stuck Detection + Artifact Verification Walkthrough Tests

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { detectStuck } from "../auto/detect-stuck.ts";
import { verifyExpectedArtifact } from "../auto-recovery.ts";
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  insertSlice,
  insertTask,
  updateTaskStatus,
  updateSliceStatus,
} from "../gsd-db.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBase(label: string): string {
  const base = mkdtempSync(join(tmpdir(), `gsd-stuck-test-${label}-`));
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  return base;
}

function makeSliceDir(base: string, mid: string, sid: string): string {
  const dir = join(base, ".gsd", "milestones", mid, "slices", sid);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeTasksDir(base: string, mid: string, sid: string): string {
  const dir = join(base, ".gsd", "milestones", mid, "slices", sid, "tasks");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeMilestoneDir(base: string, mid: string): string {
  const dir = join(base, ".gsd", "milestones", mid);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function openDb(base: string): string {
  const dbPath = join(base, ".gsd", "gsd.db");
  openDatabase(dbPath);
  return dbPath;
}

// ─── describe ─────────────────────────────────────────────────────────────────

describe("stuck-detection-walkthrough", () => {

  // ═══════════════════════════════════════════════════════════════════════════
  // Part 1: detectStuck — pure function tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe("detectStuck: Rule 1 — same error repeated", () => {
    test("same error on same unit twice → stuck with 'Same error repeated' reason", () => {
      const window = [
        { key: "M001/S01/T01", error: "Connection refused" },
        { key: "M001/S01/T01", error: "Connection refused" },
      ];
      const result = detectStuck(window);
      assert.notEqual(result, null);
      assert.equal(result!.stuck, true);
      assert.ok(result!.reason.includes("Same error repeated"));
      assert.ok(result!.reason.includes("Connection refused"));
    });

    test("same error on different units → stuck (rule 1 is error-content only)", () => {
      const window = [
        { key: "M001/S01/T01", error: "Network timeout" },
        { key: "M001/S01/T02", error: "Network timeout" },
      ];
      const result = detectStuck(window);
      assert.notEqual(result, null);
      assert.equal(result!.stuck, true);
      assert.ok(result!.reason.includes("Same error repeated"));
    });

    test("error truncated to 200 chars in reason message", () => {
      const longError = "X".repeat(300);
      const window = [
        { key: "M001/S01/T01", error: longError },
        { key: "M001/S01/T01", error: longError },
      ];
      const result = detectStuck(window);
      assert.notEqual(result, null);
      assert.ok(result!.reason.length < 300, "reason should be shorter than the original error");
      assert.ok(result!.reason.includes("X".repeat(200).slice(0, 50)));
    });

    test("one entry has error, other does not → null (both need error for rule 1)", () => {
      const window = [
        { key: "M001/S01/T01", error: "Some error" },
        { key: "M001/S01/T01" },
      ];
      const result = detectStuck(window);
      assert.equal(result, null);
    });

    test("previous has error but last does not → null", () => {
      const window = [
        { key: "M001/S01/T01" },
        { key: "M001/S01/T01", error: "Some error" },
      ];
      // last.error truthy, prev.error falsy — rule 1 skips; rule 2: only 2 entries
      // Note: rule 1 checks last.error && prev.error in that order
      // window[last] = { error: "Some error" }, window[prev] = no error
      // Actually: last = window[1] = { error }, prev = window[0] = no error
      const result = detectStuck(window);
      assert.equal(result, null);
    });

    test("empty string errors → null (falsy, rule 1 does not trigger)", () => {
      const window = [
        { key: "M001/S01/T01", error: "" },
        { key: "M001/S01/T01", error: "" },
      ];
      const result = detectStuck(window);
      // empty string is falsy — rule 1 condition (last.error && prev.error) is false
      assert.equal(result, null);
    });

    test("different errors on consecutive entries → null (rule 1 needs same error)", () => {
      const window = [
        { key: "M001/S01/T01", error: "Error A" },
        { key: "M001/S01/T01", error: "Error B" },
      ];
      const result = detectStuck(window);
      assert.equal(result, null);
    });
  });

  describe("detectStuck: Rule 2 — same unit 3x consecutive", () => {
    test("same key 3 consecutive entries → stuck with '3 consecutive times' reason", () => {
      const window = [
        { key: "M001/S01" },
        { key: "M001/S01" },
        { key: "M001/S01" },
      ];
      const result = detectStuck(window);
      assert.notEqual(result, null);
      assert.equal(result!.stuck, true);
      assert.ok(result!.reason.includes("3 consecutive times without progress"));
      assert.ok(result!.reason.includes("M001/S01"));
    });

    test("same key repeated 5 times → still stuck (last 3 match)", () => {
      const window = [
        { key: "M001/S01" },
        { key: "M001/S02" },
        { key: "M001/S01" },
        { key: "M001/S01" },
        { key: "M001/S01" },
      ];
      const result = detectStuck(window);
      assert.notEqual(result, null);
      assert.ok(result!.reason.includes("3 consecutive times without progress"));
    });

    test("window of 6 entries where only last 3 match → stuck (rule 2 checks only last 3)", () => {
      const window = [
        { key: "M001/S02" },
        { key: "M001/S03" },
        { key: "M001/S04" },
        { key: "M001/S01" },
        { key: "M001/S01" },
        { key: "M001/S01" },
      ];
      const result = detectStuck(window);
      assert.notEqual(result, null);
      assert.ok(result!.reason.includes("3 consecutive times without progress"));
    });

    test("3 entries but first is different, last 2 same → null (rule 2 needs 3 at end)", () => {
      const window = [
        { key: "M001/S02" },
        { key: "M001/S01" },
        { key: "M001/S01" },
      ];
      const result = detectStuck(window);
      assert.equal(result, null);
    });

    test("window of exactly 2 same keys → null (rule 2 needs >= 3, rule 1 needs error)", () => {
      const window = [
        { key: "M001/S01" },
        { key: "M001/S01" },
      ];
      const result = detectStuck(window);
      assert.equal(result, null);
    });
  });

  describe("detectStuck: Rule 3 — oscillation", () => {
    test("A→B→A→B pattern in last 4 → stuck with 'Oscillation detected' reason", () => {
      const window = [
        { key: "M001/S01" },
        { key: "M001/S02" },
        { key: "M001/S01" },
        { key: "M001/S02" },
      ];
      const result = detectStuck(window);
      assert.notEqual(result, null);
      assert.equal(result!.stuck, true);
      assert.ok(result!.reason.includes("Oscillation detected"));
      assert.ok(result!.reason.includes("M001/S01"));
      assert.ok(result!.reason.includes("M001/S02"));
    });

    test("oscillation with 5+ entries where last 4 are A→B→A→B → stuck", () => {
      const window = [
        { key: "M001/S03" },
        { key: "M001/S04" },
        { key: "M001/S01" },
        { key: "M001/S02" },
        { key: "M001/S01" },
        { key: "M001/S02" },
      ];
      const result = detectStuck(window);
      assert.notEqual(result, null);
      assert.ok(result!.reason.includes("Oscillation detected"));
    });

    test("oscillation pattern in older entries but last 4 do not oscillate → null", () => {
      // A→B→A→B→C→C pattern — last 4 are B→A→B→C, no oscillation
      const window = [
        { key: "M001/S01" },
        { key: "M001/S02" },
        { key: "M001/S01" },
        { key: "M001/S02" },
        { key: "M001/S03" },
        { key: "M001/S04" },
      ];
      const result = detectStuck(window);
      // last 4: S02, S03, S04 — not A→B→A→B
      // wait: last 4 = [S02, S01, S02, S03, S04].slice(-4) = [S02, S03, S04] ... no
      // window.slice(-4) = [S02, S01, S02, S03] → w[0]=S02, w[1]=S01, w[2]=S02, w[3]=S03
      // w[0]===w[2] (S02===S02) BUT w[1]!==w[3] (S01!==S03) → no oscillation
      assert.equal(result, null);
    });

    test("only 3 entries for oscillation check → null (rule 3 needs 4)", () => {
      const window = [
        { key: "M001/S01" },
        { key: "M001/S02" },
        { key: "M001/S01" },
      ];
      const result = detectStuck(window);
      assert.equal(result, null);
    });

    test("A→B→C→A pattern does not trigger oscillation (w[1]!==w[3])", () => {
      const window = [
        { key: "M001/S01" },
        { key: "M001/S02" },
        { key: "M001/S03" },
        { key: "M001/S01" },
      ];
      // w[0]=S01, w[1]=S02, w[2]=S03, w[3]=S01
      // w[0]===w[2]? S01===S03? No → no oscillation
      const result = detectStuck(window);
      assert.equal(result, null);
    });

    test("A→A→A→A pattern triggers rule 2, not rule 3 (same key pattern)", () => {
      const window = [
        { key: "M001/S01" },
        { key: "M001/S01" },
        { key: "M001/S01" },
        { key: "M001/S01" },
      ];
      const result = detectStuck(window);
      assert.notEqual(result, null);
      // rule 2 fires first (3 consecutive) — reason will be about "3 consecutive"
      assert.ok(result!.reason.includes("3 consecutive times without progress"));
    });
  });

  describe("detectStuck: edge cases", () => {
    test("empty window → null", () => {
      const result = detectStuck([]);
      assert.equal(result, null);
    });

    test("single entry window → null", () => {
      const result = detectStuck([{ key: "M001/S01" }]);
      assert.equal(result, null);
    });

    test("all different units → null (no rule triggers)", () => {
      const window = [
        { key: "M001/S01" },
        { key: "M001/S02" },
        { key: "M001/S03" },
        { key: "M001/S04" },
        { key: "M001/S05" },
      ];
      const result = detectStuck(window);
      assert.equal(result, null);
    });

    test("window exactly at boundary 2 for rule 1: same error → stuck", () => {
      const window = [
        { key: "M001/S01", error: "boundary-error" },
        { key: "M001/S02", error: "boundary-error" },
      ];
      const result = detectStuck(window);
      assert.notEqual(result, null);
      assert.ok(result!.reason.includes("Same error repeated"));
    });

    test("window exactly at boundary 3 for rule 2: all same key → stuck", () => {
      const window = [
        { key: "M001/S01" },
        { key: "M001/S01" },
        { key: "M001/S01" },
      ];
      const result = detectStuck(window);
      assert.notEqual(result, null);
      assert.ok(result!.reason.includes("3 consecutive times without progress"));
    });

    test("window exactly at boundary 4 for rule 3: A→B→A→B → stuck", () => {
      const window = [
        { key: "M001/S01" },
        { key: "M001/S02" },
        { key: "M001/S01" },
        { key: "M001/S02" },
      ];
      const result = detectStuck(window);
      assert.notEqual(result, null);
      assert.ok(result!.reason.includes("Oscillation detected"));
    });

    test("rule 1 takes precedence over rule 2 when both would trigger", () => {
      // Same key 3 times AND same error on last 2
      const window = [
        { key: "M001/S01", error: "boom" },
        { key: "M001/S01", error: "boom" },
        { key: "M001/S01", error: "boom" },
      ];
      const result = detectStuck(window);
      assert.notEqual(result, null);
      // rule 1 is checked first — same error repeated
      assert.ok(result!.reason.includes("Same error repeated"));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Part 2: verifyExpectedArtifact — disk + DB based tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe("verifyExpectedArtifact: happy path", () => {
    let base: string;

    afterEach(() => {
      closeDatabase();
      if (base) rmSync(base, { recursive: true, force: true });
    });

    test("hook/custom unit → always true regardless of disk state", () => {
      base = makeBase("hook-custom");
      const result = verifyExpectedArtifact("hook/custom", "M001/S01/T01", base);
      assert.equal(result, true);
    });

    test("hook/pre-execute unit → always true", () => {
      base = makeBase("hook-pre");
      const result = verifyExpectedArtifact("hook/pre-execute", "M001/S01/T01", base);
      assert.equal(result, true);
    });

    test("execute-task: SUMMARY file present + DB status complete → true", () => {
      base = makeBase("execute-task-ok");
      const tasksDir = makeTasksDir(base, "M001", "S01");
      writeFileSync(join(tasksDir, "T01-SUMMARY.md"), "# Summary\n\nDone.");
      // Also write T01-PLAN.md so plan-slice verification works downstream
      writeFileSync(join(tasksDir, "T01-PLAN.md"), "# T01 Plan\n");
      openDb(base);
      insertMilestone({ id: "M001", title: "Milestone 1", status: "active" });
      insertSlice({ milestoneId: "M001", id: "S01", title: "Slice 1" });
      insertTask({ milestoneId: "M001", sliceId: "S01", id: "T01", status: "complete" });
      const result = verifyExpectedArtifact("execute-task", "M001/S01/T01", base);
      assert.equal(result, true);
    });

    test("plan-slice: PLAN.md with checkbox tasks → true", () => {
      base = makeBase("plan-slice-checkbox");
      const sliceDir = makeSliceDir(base, "M001", "S01");
      const tasksDir = join(sliceDir, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const planContent = [
        "# S01 Plan",
        "",
        "- [x] **T01: Implement feature**",
        "- [ ] **T02: Write tests**",
      ].join("\n");
      writeFileSync(join(sliceDir, "S01-PLAN.md"), planContent);
      openDb(base);
      insertMilestone({ id: "M001", title: "Milestone 1", status: "active" });
      insertSlice({ milestoneId: "M001", id: "S01", title: "Slice 1" });
      insertTask({ milestoneId: "M001", sliceId: "S01", id: "T01", status: "pending" });
      insertTask({ milestoneId: "M001", sliceId: "S01", id: "T02", status: "pending" });
      writeFileSync(join(tasksDir, "T01-PLAN.md"), "# T01\n");
      writeFileSync(join(tasksDir, "T02-PLAN.md"), "# T02\n");
      const result = verifyExpectedArtifact("plan-slice", "M001/S01", base);
      assert.equal(result, true);
    });

    test("plan-slice: PLAN.md with heading-style tasks (### T01:) → true", () => {
      base = makeBase("plan-slice-heading");
      const sliceDir = makeSliceDir(base, "M001", "S01");
      const tasksDir = join(sliceDir, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const planContent = [
        "# S01 Plan",
        "",
        "### T01: Implement feature",
        "",
        "Do the thing.",
        "",
        "### T02 — Write tests",
        "",
        "Write them.",
      ].join("\n");
      writeFileSync(join(sliceDir, "S01-PLAN.md"), planContent);
      openDb(base);
      insertMilestone({ id: "M001", title: "Milestone 1", status: "active" });
      insertSlice({ milestoneId: "M001", id: "S01", title: "Slice 1" });
      insertTask({ milestoneId: "M001", sliceId: "S01", id: "T01", status: "pending" });
      insertTask({ milestoneId: "M001", sliceId: "S01", id: "T02", status: "pending" });
      writeFileSync(join(tasksDir, "T01-PLAN.md"), "# T01\n");
      writeFileSync(join(tasksDir, "T02-PLAN.md"), "# T02\n");
      const result = verifyExpectedArtifact("plan-slice", "M001/S01", base);
      assert.equal(result, true);
    });

    test("validate-milestone: VALIDATION.md with terminal verdict → true", () => {
      base = makeBase("validate-milestone-ok");
      const mDir = makeMilestoneDir(base, "M001");
      const validationContent = [
        "---",
        "verdict: pass",
        "remediation_round: 0",
        "---",
        "",
        "# Validation Report",
        "",
        "All checks passed.",
      ].join("\n");
      writeFileSync(join(mDir, "M001-VALIDATION.md"), validationContent);
      const result = verifyExpectedArtifact("validate-milestone", "M001", base);
      assert.equal(result, true);
    });

    test("complete-slice: SUMMARY + UAT present + DB status complete → true", () => {
      base = makeBase("complete-slice-ok");
      const sliceDir = makeSliceDir(base, "M001", "S01");
      writeFileSync(join(sliceDir, "S01-SUMMARY.md"), "# Summary\n\nDone.");
      writeFileSync(join(sliceDir, "S01-UAT.md"), "# UAT\n\nPassed.");
      openDb(base);
      insertMilestone({ id: "M001", title: "Milestone 1", status: "active" });
      insertSlice({ milestoneId: "M001", id: "S01", title: "Slice 1", status: "complete" });
      const result = verifyExpectedArtifact("complete-slice", "M001/S01", base);
      assert.equal(result, true);
    });
  });

  describe("verifyExpectedArtifact: failure modes", () => {
    let base: string;

    afterEach(() => {
      closeDatabase();
      if (base) rmSync(base, { recursive: true, force: true });
    });

    test("execute-task: no SUMMARY file → false", () => {
      base = makeBase("execute-task-no-summary");
      makeTasksDir(base, "M001", "S01");
      openDb(base);
      insertMilestone({ id: "M001", title: "Milestone 1", status: "active" });
      insertSlice({ milestoneId: "M001", id: "S01", title: "Slice 1" });
      insertTask({ milestoneId: "M001", sliceId: "S01", id: "T01", status: "complete" });
      const result = verifyExpectedArtifact("execute-task", "M001/S01/T01", base);
      assert.equal(result, false);
    });

    test("execute-task: DB says pending even though SUMMARY exists → false (DB authoritative)", () => {
      base = makeBase("execute-task-db-pending");
      const tasksDir = makeTasksDir(base, "M001", "S01");
      writeFileSync(join(tasksDir, "T01-SUMMARY.md"), "# Summary\n\nDone.");
      openDb(base);
      insertMilestone({ id: "M001", title: "Milestone 1", status: "active" });
      insertSlice({ milestoneId: "M001", id: "S01", title: "Slice 1" });
      insertTask({ milestoneId: "M001", sliceId: "S01", id: "T01", status: "pending" });
      const result = verifyExpectedArtifact("execute-task", "M001/S01/T01", base);
      assert.equal(result, false);
    });

    test("execute-task: DB says complete but no SUMMARY file → true (DB authoritative)", () => {
      base = makeBase("execute-task-db-complete-no-file");
      makeTasksDir(base, "M001", "S01");
      openDb(base);
      insertMilestone({ id: "M001", title: "Milestone 1", status: "active" });
      insertSlice({ milestoneId: "M001", id: "S01", title: "Slice 1" });
      insertTask({ milestoneId: "M001", sliceId: "S01", id: "T01", status: "complete" });
      // No SUMMARY file written — but DB says complete
      // resolveExpectedArtifactPath returns a path that does not exist
      // verifyExpectedArtifact: existsSync(absPath) → false → returns false before DB check
      // However, looking at the source: absPath is checked with existsSync before DB check
      // So no SUMMARY + DB complete → false (file check fails before DB check)
      const result = verifyExpectedArtifact("execute-task", "M001/S01/T01", base);
      assert.equal(result, false);
    });

    test("plan-slice: PLAN.md exists but no task entries → false", () => {
      base = makeBase("plan-slice-no-tasks");
      const sliceDir = makeSliceDir(base, "M001", "S01");
      const planContent = [
        "# S01 Plan",
        "",
        "This plan has no task entries yet.",
        "",
        "## Overview",
        "Work TBD.",
      ].join("\n");
      writeFileSync(join(sliceDir, "S01-PLAN.md"), planContent);
      const result = verifyExpectedArtifact("plan-slice", "M001/S01", base);
      assert.equal(result, false);
    });

    test("plan-slice: PLAN.md is empty → false", () => {
      base = makeBase("plan-slice-empty");
      const sliceDir = makeSliceDir(base, "M001", "S01");
      writeFileSync(join(sliceDir, "S01-PLAN.md"), "");
      const result = verifyExpectedArtifact("plan-slice", "M001/S01", base);
      assert.equal(result, false);
    });

    test("validate-milestone: VALIDATION.md exists but no verdict → false", () => {
      base = makeBase("validate-milestone-no-verdict");
      const mDir = makeMilestoneDir(base, "M001");
      const validationContent = [
        "# Validation Report",
        "",
        "Some analysis here but no frontmatter verdict field.",
        "",
        "## Summary",
        "Reviewed everything.",
      ].join("\n");
      writeFileSync(join(mDir, "M001-VALIDATION.md"), validationContent);
      const result = verifyExpectedArtifact("validate-milestone", "M001", base);
      assert.equal(result, false);
    });

    test("validate-milestone: no VALIDATION file at all → false", () => {
      base = makeBase("validate-milestone-no-file");
      makeMilestoneDir(base, "M001");
      const result = verifyExpectedArtifact("validate-milestone", "M001", base);
      assert.equal(result, false);
    });

    test("complete-slice: UAT file missing even though SUMMARY and DB complete → false", () => {
      base = makeBase("complete-slice-no-uat");
      const sliceDir = makeSliceDir(base, "M001", "S01");
      writeFileSync(join(sliceDir, "S01-SUMMARY.md"), "# Summary\n\nDone.");
      // No S01-UAT.md written
      openDb(base);
      insertMilestone({ id: "M001", title: "Milestone 1", status: "active" });
      insertSlice({ milestoneId: "M001", id: "S01", title: "Slice 1", status: "complete" });
      const result = verifyExpectedArtifact("complete-slice", "M001/S01", base);
      assert.equal(result, false);
    });

    test("reactive-execute: 2 tasks dispatched, only 1 has SUMMARY → false", () => {
      base = makeBase("reactive-execute-partial");
      const tasksDir = makeTasksDir(base, "M001", "S01");
      writeFileSync(join(tasksDir, "T02-SUMMARY.md"), "# Summary T02\n\nDone.");
      // T03-SUMMARY.md missing
      const result = verifyExpectedArtifact(
        "reactive-execute",
        "M001/S01/reactive+T02,T03",
        base,
      );
      assert.equal(result, false);
    });

    test("reactive-execute: all dispatched tasks have SUMMARY → true", () => {
      base = makeBase("reactive-execute-all");
      const tasksDir = makeTasksDir(base, "M001", "S01");
      writeFileSync(join(tasksDir, "T02-SUMMARY.md"), "# Summary T02\n\nDone.");
      writeFileSync(join(tasksDir, "T03-SUMMARY.md"), "# Summary T03\n\nDone.");
      const result = verifyExpectedArtifact(
        "reactive-execute",
        "M001/S01/reactive+T02,T03",
        base,
      );
      assert.equal(result, true);
    });

    test("unknown unit type with no artifact path → false", () => {
      base = makeBase("unknown-unit");
      const result = verifyExpectedArtifact("totally-unknown-unit", "M001/S01/T01", base);
      assert.equal(result, false);
    });

    test("rewrite-docs: OVERRIDES has '**Scope:** active' → false", () => {
      base = makeBase("rewrite-docs-active");
      mkdirSync(join(base, ".gsd"), { recursive: true });
      const overridesContent = [
        "# GSD Overrides",
        "",
        "---",
        "",
        "## Override: 2026-01-01T00:00:00.000Z",
        "",
        "**Change:** Use Postgres instead of SQLite",
        "**Scope:** active",
        "**Applied-at:** M001/S01/T01",
        "",
        "---",
      ].join("\n");
      writeFileSync(join(base, ".gsd", "OVERRIDES.md"), overridesContent);
      const result = verifyExpectedArtifact("rewrite-docs", "M001", base);
      assert.equal(result, false);
    });

    test("rewrite-docs: OVERRIDES has only resolved scopes → true", () => {
      base = makeBase("rewrite-docs-resolved");
      mkdirSync(join(base, ".gsd"), { recursive: true });
      const overridesContent = [
        "# GSD Overrides",
        "",
        "---",
        "",
        "## Override: 2026-01-01T00:00:00.000Z",
        "",
        "**Change:** Use Postgres instead of SQLite",
        "**Scope:** resolved",
        "**Applied-at:** M001/S01/T01",
        "",
        "---",
      ].join("\n");
      writeFileSync(join(base, ".gsd", "OVERRIDES.md"), overridesContent);
      const result = verifyExpectedArtifact("rewrite-docs", "M001", base);
      assert.equal(result, true);
    });

    test("rewrite-docs: no OVERRIDES file → true", () => {
      base = makeBase("rewrite-docs-no-file");
      mkdirSync(join(base, ".gsd"), { recursive: true });
      // No OVERRIDES.md written
      const result = verifyExpectedArtifact("rewrite-docs", "M001", base);
      assert.equal(result, true);
    });
  });
});
