import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { GSDState } from "../types.ts";
import {
  buildSmartLauncherModel,
  type SmartLauncherFacts,
} from "../smart-launcher.ts";
import { handleAutoCommand } from "../commands/handlers/auto.ts";

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

test("bare /gsd opens the smart launcher wizard", async (t) => {
  const previousCwd = process.cwd();
  const base = mkdtempSync(join(tmpdir(), "gsd-smart-launcher-route-"));
  t.after(() => {
    process.chdir(previousCwd);
    rmSync(base, { recursive: true, force: true });
  });

  process.chdir(base);
  const prompts: string[] = [];
  const notifications: string[] = [];
  const ctx = {
    ui: {
      custom: async () => undefined,
      select: async (title: string, labels: string[]) => {
        prompts.push(title);
        return labels[labels.length - 1];
      },
      notify: (message: string) => notifications.push(message),
    },
  };

  const handled = await handleAutoCommand("", ctx as any, {} as any);

  assert.equal(handled, true);
  assert.deepEqual(prompts, ["GSD — Start Here"]);
  assert.deepEqual(notifications, []);
});
