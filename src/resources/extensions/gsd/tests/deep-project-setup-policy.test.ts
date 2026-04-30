import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  resolveDeepProjectSetupState,
} from "../deep-project-setup-policy.ts";
import type { GSDPreferences } from "../preferences.ts";

const deepPrefs = { planning_depth: "deep" } as GSDPreferences;

const validProject = readFileSync(
  new URL("../schemas/__fixtures__/valid-project.md", import.meta.url),
  "utf-8",
);
const validRequirements = readFileSync(
  new URL("../schemas/__fixtures__/valid-requirements.md", import.meta.url),
  "utf-8",
);

function makeBase(): string {
  const base = join(tmpdir(), `gsd-deep-policy-${randomUUID()}`);
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function writeReadyProject(base: string): void {
  writeFileSync(
    join(base, ".gsd", "PREFERENCES.md"),
    "---\nplanning_depth: deep\nworkflow_prefs_captured: true\n---\n",
  );
  writeFileSync(join(base, ".gsd", "PROJECT.md"), validProject);
  writeFileSync(join(base, ".gsd", "REQUIREMENTS.md"), validRequirements);
  mkdirSync(join(base, ".gsd", "runtime"), { recursive: true });
}

function writeDecision(base: string, value: Record<string, unknown> | string): void {
  mkdirSync(join(base, ".gsd", "runtime"), { recursive: true });
  writeFileSync(
    join(base, ".gsd", "runtime", "research-decision.json"),
    typeof value === "string" ? value : JSON.stringify(value),
  );
}

function readDecision(base: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(base, ".gsd", "runtime", "research-decision.json"), "utf-8"));
}

function writeAllDimensionBlockers(base: string): void {
  mkdirSync(join(base, ".gsd", "research"), { recursive: true });
  for (const dimension of ["STACK", "FEATURES", "ARCHITECTURE", "PITFALLS"]) {
    writeFileSync(join(base, ".gsd", "research", `${dimension}-BLOCKER.md`), "# blocked\n");
  }
}

test("deep setup policy: skip decision wins over stale research blockers", () => {
  const base = makeBase();
  try {
    writeReadyProject(base);
    writeDecision(base, { decision: "skip", source: "workflow-preferences" });
    writeAllDimensionBlockers(base);

    const state = resolveDeepProjectSetupState(deepPrefs, base);
    assert.deepEqual({ status: state.status, stage: state.stage }, { status: "complete", stage: null });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("deep setup policy: legacy workflow research default normalizes to skip", () => {
  const base = makeBase();
  try {
    writeReadyProject(base);
    writeDecision(base, { decision: "research", source: "workflow-preferences" });
    writeAllDimensionBlockers(base);

    const state = resolveDeepProjectSetupState(deepPrefs, base);
    assert.deepEqual({ status: state.status, stage: state.stage }, { status: "complete", stage: null });
    const decision = readDecision(base);
    assert.equal(decision.decision, "skip");
    assert.equal(decision.source, "workflow-preferences");
    assert.equal(decision.previous_source, "workflow-preferences");
    assert.equal(decision.reason, "legacy-workflow-research-default");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("deep setup policy: missing and malformed markers repair to default skip", () => {
  const missingBase = makeBase();
  const malformedBase = makeBase();
  try {
    writeReadyProject(missingBase);
    const missingState = resolveDeepProjectSetupState(deepPrefs, missingBase);
    assert.deepEqual({ status: missingState.status, stage: missingState.stage }, { status: "complete", stage: null });
    assert.equal(readDecision(missingBase).reason, "missing-default-repair");

    writeReadyProject(malformedBase);
    writeDecision(malformedBase, "{");
    const malformedState = resolveDeepProjectSetupState(deepPrefs, malformedBase);
    assert.deepEqual({ status: malformedState.status, stage: malformedState.stage }, { status: "complete", stage: null });
    assert.equal(readDecision(malformedBase).reason, "malformed-default-repair");
  } finally {
    rmSync(missingBase, { recursive: true, force: true });
    rmSync(malformedBase, { recursive: true, force: true });
  }
});

test("deep setup policy: explicit research can dispatch, block, or complete", () => {
  const pendingBase = makeBase();
  const blockedBase = makeBase();
  const completeBase = makeBase();
  try {
    writeReadyProject(pendingBase);
    writeDecision(pendingBase, { decision: "research", source: "research-decision" });
    const pending = resolveDeepProjectSetupState(deepPrefs, pendingBase);
    assert.deepEqual({ status: pending.status, stage: pending.stage }, { status: "pending", stage: "project-research" });

    writeReadyProject(blockedBase);
    writeDecision(blockedBase, { decision: "research", source: "user" });
    writeAllDimensionBlockers(blockedBase);
    const blocked = resolveDeepProjectSetupState(deepPrefs, blockedBase);
    assert.deepEqual({ status: blocked.status, stage: blocked.stage }, { status: "blocked", stage: "project-research" });

    writeReadyProject(completeBase);
    writeDecision(completeBase, { decision: "research", source: "research-decision" });
    mkdirSync(join(completeBase, ".gsd", "research"), { recursive: true });
    for (const name of ["STACK.md", "FEATURES.md", "ARCHITECTURE.md"]) {
      writeFileSync(join(completeBase, ".gsd", "research", name), "# done\n");
    }
    writeFileSync(join(completeBase, ".gsd", "research", "PITFALLS-BLOCKER.md"), "# blocked\n");
    const complete = resolveDeepProjectSetupState(deepPrefs, completeBase);
    assert.deepEqual({ status: complete.status, stage: complete.stage }, { status: "complete", stage: null });
    assert.equal(existsSync(join(completeBase, ".gsd", "runtime", "research-project-inflight")), false);
  } finally {
    rmSync(pendingBase, { recursive: true, force: true });
    rmSync(blockedBase, { recursive: true, force: true });
    rmSync(completeBase, { recursive: true, force: true });
  }
});

