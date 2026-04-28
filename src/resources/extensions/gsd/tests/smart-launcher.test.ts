import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { GSDState } from "../types.ts";
import {
  buildSmartLauncherModel,
  type SmartLauncherFacts,
} from "../smart-launcher.ts";

function state(overrides: Partial<GSDState>): GSDState {
  return {
    activeMilestone: null,
    activeSlice: null,
    activeTask: null,
    phase: "pre-planning",
    recentDecisions: [],
    blockers: [],
    nextAction: "",
    registry: [],
    ...overrides,
  };
}

function facts(overrides: Partial<SmartLauncherFacts>): SmartLauncherFacts {
  return {
    hasBootstrapArtifacts: true,
    milestoneCount: 0,
    autoActive: false,
    deepStagePending: false,
    interruptedClassification: "none",
    state: state({}),
    ...overrides,
  };
}

function actionIds(model: ReturnType<typeof buildSmartLauncherModel>): string[] {
  return model.actions.map((action) => action.id);
}

test("smart launcher classifies uninitialized projects and offers setup choices", () => {
  const model = buildSmartLauncherModel(facts({
    hasBootstrapArtifacts: false,
    milestoneCount: 0,
    state: null,
  }));

  assert.equal(model.kind, "uninitialized");
  assert.deepEqual(actionIds(model), ["init", "deep_project", "setup"]);
});

test("smart launcher offers first-project choices when initialized with no milestones", () => {
  const model = buildSmartLauncherModel(facts({
    milestoneCount: 0,
    state: state({ registry: [] }),
  }));

  assert.equal(model.kind, "first-project");
  assert.deepEqual(actionIds(model), ["quick", "step", "deep_project", "template", "setup"]);
});

test("smart launcher prioritizes recoverable interrupted sessions", () => {
  const model = buildSmartLauncherModel(facts({
    milestoneCount: 1,
    interruptedClassification: "recoverable",
    state: state({
      activeMilestone: { id: "M001", title: "Build" },
      phase: "executing",
      registry: [{ id: "M001", title: "Build", status: "active" }],
    }),
  }));

  assert.equal(model.kind, "interrupted");
  assert.deepEqual(actionIds(model), ["resume", "step", "status", "stop"]);
});

test("smart launcher offers discuss and plan choices for pre-planning milestones", () => {
  const model = buildSmartLauncherModel(facts({
    milestoneCount: 1,
    state: state({
      activeMilestone: { id: "M001", title: "Build" },
      phase: "pre-planning",
      registry: [{ id: "M001", title: "Build", status: "active" }],
    }),
  }));

  assert.equal(model.kind, "planning");
  assert.deepEqual(actionIds(model), ["discuss", "plan", "deep_milestone", "quick", "status"]);
});

test("smart launcher offers step and auto choices for roadmap-ready work", () => {
  const model = buildSmartLauncherModel(facts({
    milestoneCount: 1,
    state: state({
      activeMilestone: { id: "M001", title: "Build" },
      activeSlice: { id: "S01", title: "Core" },
      phase: "planning",
      registry: [{ id: "M001", title: "Build", status: "active" }],
    }),
  }));

  assert.equal(model.kind, "executing");
  assert.deepEqual(actionIds(model), ["step", "auto", "quick", "status"]);
});

test("smart launcher suppresses quick and mutation-heavy choices while auto-mode is active", () => {
  const model = buildSmartLauncherModel(facts({
    autoActive: true,
    milestoneCount: 1,
    state: state({
      activeMilestone: { id: "M001", title: "Build" },
      activeSlice: { id: "S01", title: "Core" },
      phase: "executing",
      registry: [{ id: "M001", title: "Build", status: "active" }],
    }),
  }));

  assert.equal(model.kind, "interrupted");
  assert.deepEqual(actionIds(model), ["status", "stop"]);
});

test("bare /gsd routes through the smart launcher while /gsd next keeps direct step mode", () => {
  const autoHandlerSource = readFileSync(
    join(import.meta.dirname, "..", "commands", "handlers", "auto.ts"),
    "utf-8",
  );

  assert.match(
    autoHandlerSource,
    /if\s*\(\s*trimmed\s*===\s*""\s*\)\s*\{[\s\S]*showSmartLauncher\(/,
    "bare /gsd should call showSmartLauncher",
  );
  assert.match(
    autoHandlerSource,
    /trimmed\s*===\s*"next"[\s\S]*startAutoDetached\(ctx,\s*pi,\s*projectRoot\(\),\s*verboseMode,\s*\{[\s\S]*step:\s*true/s,
    "/gsd next should still start step mode directly",
  );
});
