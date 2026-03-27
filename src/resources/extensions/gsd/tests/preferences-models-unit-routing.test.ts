import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveModelWithFallbacksForUnit } from "../preferences-models.js";

function withPrefs(prefsYaml: string, fn: () => void): void {
  const originalCwd = process.cwd();
  const originalGsdHome = process.env.GSD_HOME;
  const tempProject = mkdtempSync(join(tmpdir(), "gsd-unit-routing-"));
  const tempGsdHome = mkdtempSync(join(tmpdir(), "gsd-unit-routing-home-"));

  try {
    mkdirSync(join(tempProject, ".gsd"), { recursive: true });
    writeFileSync(
      join(tempProject, ".gsd", "PREFERENCES.md"),
      prefsYaml,
      "utf-8",
    );
    process.env.GSD_HOME = tempGsdHome;
    process.chdir(tempProject);
    fn();
  } finally {
    process.chdir(originalCwd);
    if (originalGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = originalGsdHome;
    rmSync(tempProject, { recursive: true, force: true });
    rmSync(tempGsdHome, { recursive: true, force: true });
  }
}

const PREFS = [
  "---",
  "models:",
  "  research: research-model",
  "  planning: planning-model",
  "  execution: execution-model",
  "  completion: completion-model",
  "  subagent: subagent-model",
  "---",
].join("\n");

test("all completion-phase unit types resolve to models.completion (issue #2894)", () => {
  withPrefs(PREFS, () => {
    const completionTypes = [
      "complete-slice",
      "complete-milestone",
      "validate-milestone",
      "gate-evaluate",
      "rewrite-docs",
      "run-uat",
    ];
    for (const unitType of completionTypes) {
      const result = resolveModelWithFallbacksForUnit(unitType);
      assert.ok(result, `${unitType} should resolve to a model config`);
      assert.equal(result.primary, "completion-model", `${unitType} should map to completion model`);
    }
  });
});

test("reassess-roadmap and discuss-milestone resolve to models.planning (issue #2894)", () => {
  withPrefs(PREFS, () => {
    const planningTypes = [
      "plan-milestone",
      "plan-slice",
      "replan-slice",
      "reassess-roadmap",
      "discuss-milestone",
    ];
    for (const unitType of planningTypes) {
      const result = resolveModelWithFallbacksForUnit(unitType);
      assert.ok(result, `${unitType} should resolve to a model config`);
      assert.equal(result.primary, "planning-model", `${unitType} should map to planning model`);
    }
  });
});

test("reactive-execute resolves to models.execution (issue #2894)", () => {
  withPrefs(PREFS, () => {
    const result = resolveModelWithFallbacksForUnit("reactive-execute");
    assert.ok(result, "reactive-execute should resolve to a model config");
    assert.equal(result.primary, "execution-model", "reactive-execute should map to execution model");
  });
});

test("research unit types resolve to models.research", () => {
  withPrefs(PREFS, () => {
    for (const unitType of ["research-milestone", "research-slice"]) {
      const result = resolveModelWithFallbacksForUnit(unitType);
      assert.ok(result, `${unitType} should resolve`);
      assert.equal(result.primary, "research-model", `${unitType} should map to research model`);
    }
  });
});

test("unknown unit type returns undefined", () => {
  withPrefs(PREFS, () => {
    const result = resolveModelWithFallbacksForUnit("nonexistent-type");
    assert.equal(result, undefined);
  });
});
