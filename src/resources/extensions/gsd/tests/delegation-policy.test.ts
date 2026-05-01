import test from "node:test";
import assert from "node:assert/strict";
import {
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
