import test from "node:test";
import assert from "node:assert/strict";
import {
  annotateBackgroundable,
  getDelegationVerdict,
  getVerdictByUnitType,
  isBackgroundable,
  listBackgroundableTools,
} from "../delegation-policy.js";

// Pin the GOOD set: changes here must come with explicit re-evaluation.
const EXPECTED_BACKGROUNDABLE = [
  "gsd_execute",
  "gsd_plan_slice",
  "gsd_reassess_roadmap",
  "gsd_validate_milestone",
];

test("isBackgroundable returns true for the four GOOD-verdict tools", () => {
  for (const name of EXPECTED_BACKGROUNDABLE) {
    assert.equal(isBackgroundable(name), true, `${name} should be backgroundable`);
  }
});

test("isBackgroundable returns false for RISKY-verdict tools", () => {
  for (const name of ["gsd_doctor", "gsd_plan_milestone", "gsd_replan_slice"]) {
    assert.equal(isBackgroundable(name), false, `${name} should not be backgroundable`);
  }
});

test("isBackgroundable returns false for NO-verdict tools", () => {
  assert.equal(isBackgroundable("gsd_plan_task"), false);
});

test("isBackgroundable defaults to false for unknown tools (default-deny)", () => {
  assert.equal(isBackgroundable("gsd_nonexistent_tool"), false);
  assert.equal(isBackgroundable(""), false);
});

test("listBackgroundableTools returns exactly the four GOOD tools, sorted", () => {
  assert.deepEqual(listBackgroundableTools(), EXPECTED_BACKGROUNDABLE);
});

test("getDelegationVerdict resolves alias names to canonical entries", () => {
  for (const [alias, canonical] of [
    ["gsd_milestone_validate", "gsd_validate_milestone"],
    ["gsd_roadmap_reassess", "gsd_reassess_roadmap"],
    ["gsd_slice_replan", "gsd_replan_slice"],
    ["gsd_task_plan", "gsd_plan_task"],
  ] as const) {
    const entry = getDelegationVerdict(alias);
    assert.ok(entry, `alias ${alias} should resolve`);
    assert.equal(entry.toolName, canonical, `${alias} should resolve to ${canonical}`);
  }
});

test("plan_slice carries the slice-lock + await constraints", () => {
  const entry = getDelegationVerdict("gsd_plan_slice");
  assert.ok(entry);
  assert.ok(entry.constraints && entry.constraints.length >= 3);
  assert.ok(
    entry.constraints!.some((c) => /lock the slice/i.test(c)),
    "plan_slice must carry the slice-lock constraint",
  );
  assert.ok(
    entry.constraints!.some((c) => /await background completion/i.test(c)),
    "plan_slice must require await before downstream reads",
  );
});

test("doctor carries fix-mode safety constraints", () => {
  const entry = getDelegationVerdict("gsd_doctor");
  assert.ok(entry);
  assert.equal(entry.verdict, "risky");
  assert.ok(
    entry.constraints && entry.constraints.some((c) => /fix=false/.test(c)),
    "doctor must restrict background runs to fix=false",
  );
});

test("getVerdictByUnitType maps dispatcher unit types back to the policy", () => {
  assert.equal(getVerdictByUnitType("plan-slice")?.toolName, "gsd_plan_slice");
  assert.equal(getVerdictByUnitType("validate-milestone")?.toolName, "gsd_validate_milestone");
  assert.equal(getVerdictByUnitType("reassess-roadmap")?.toolName, "gsd_reassess_roadmap");
  assert.equal(getVerdictByUnitType("plan-milestone")?.toolName, "gsd_plan_milestone");
  assert.equal(getVerdictByUnitType("replan-slice")?.toolName, "gsd_replan_slice");
  assert.equal(getVerdictByUnitType("nonexistent-unit"), null);
});

test("every entry carries a non-empty rationale so the verdict is auditable", () => {
  for (const name of [...EXPECTED_BACKGROUNDABLE, "gsd_doctor", "gsd_plan_milestone", "gsd_replan_slice", "gsd_plan_task"]) {
    const entry = getDelegationVerdict(name);
    assert.ok(entry, `${name} should be in the policy`);
    assert.ok(entry.rationale.length > 20, `${name} rationale must be substantive`);
  }
});

// ─── annotateBackgroundable contract pins ────────────────────────────────

test("annotateBackgroundable recomputes the verdict on every call (no internal cache)", () => {
  // The annotator mutates in place. Repeated calls on the same object with
  // different unit types must always reflect the latest unitType — never a
  // stale cached value. This pins the contract documented in the JSDoc so a
  // future "optimization" that adds memoization keyed on object identity
  // breaks the suite instead of silently leaking a stale flag.
  const action: { action: "dispatch"; unitType: string; backgroundable?: boolean } = {
    action: "dispatch",
    unitType: "plan-slice",
  };
  annotateBackgroundable(action);
  assert.equal(action.backgroundable, true, "plan-slice should annotate true");

  action.unitType = "plan-milestone";
  annotateBackgroundable(action);
  assert.equal(action.backgroundable, false, "plan-milestone (risky) should re-annotate false");

  action.unitType = "validate-milestone";
  annotateBackgroundable(action);
  assert.equal(action.backgroundable, true, "validate-milestone should re-annotate true");

  action.unitType = "complete-slice";
  annotateBackgroundable(action);
  assert.equal(action.backgroundable, false, "uncovered unit type should re-annotate false (default-deny)");
});

test("annotateBackgroundable passes stop/skip actions through unchanged", () => {
  const stop = { action: "stop" as const, reason: "x", level: "info" as const };
  const skip = { action: "skip" as const };
  assert.equal(annotateBackgroundable(stop), stop);
  assert.equal(annotateBackgroundable(skip), skip);
  assert.equal((stop as Record<string, unknown>).backgroundable, undefined);
  assert.equal((skip as Record<string, unknown>).backgroundable, undefined);
});

// ─── F4 latent gap pin: silent default-deny on unit types invoking GOOD tools ──

test("execute-task / reactive-execute / execute-task-simple intentionally default-deny despite gsd_execute being GOOD", () => {
  // gsd_execute carries a GOOD verdict but no `unitType`, by design — the
  // unit-level orchestrations wrap prompt and harness work whose safety is
  // a separate analysis. Lifting these out of default-deny must be an
  // explicit, audited change. This test pins the current behavior; if the
  // policy entry gains a unitType mapping (or a unitTypes array), update
  // both the entry and this test together.
  for (const unitType of ["execute-task", "execute-task-simple", "reactive-execute"]) {
    assert.equal(
      getVerdictByUnitType(unitType),
      null,
      `${unitType} must remain unmapped until per-unit analysis is recorded`,
    );
  }
});
