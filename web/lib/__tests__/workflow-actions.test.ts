import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { deriveWorkflowAction, type WorkflowActionInput } from "../workflow-actions.ts";

/**
 * Regression tests for deriveWorkflowAction — specifically covering
 * the auto-mode state transitions that were broken when chat-mode.tsx
 * read stale boot state instead of live state.
 *
 * See: https://github.com/gsd-build/gsd-2/issues/2705
 */

function makeInput(overrides: Partial<WorkflowActionInput> = {}): WorkflowActionInput {
  return {
    phase: "executing",
    autoActive: false,
    autoPaused: false,
    onboardingLocked: false,
    commandInFlight: null,
    bootStatus: "ready",
    hasMilestones: true,
    projectDetectionKind: null,
    ...overrides,
  };
}

describe("deriveWorkflowAction", () => {
  describe("auto-mode active state (#2705 regression)", () => {
    test("shows 'Stop Auto' when autoActive is true", () => {
      const result = deriveWorkflowAction(makeInput({ autoActive: true }));
      assert.equal(result.primary?.label, "Stop Auto");
      assert.equal(result.primary?.command, "/gsd stop");
      assert.equal(result.primary?.variant, "destructive");
    });

    test("shows 'Start Auto' when autoActive is false and phase is executing", () => {
      const result = deriveWorkflowAction(makeInput({ autoActive: false, phase: "executing" }));
      assert.equal(result.primary?.label, "Start Auto");
      assert.equal(result.primary?.command, "/gsd auto");
    });

    test("shows 'Resume Auto' when auto is paused", () => {
      const result = deriveWorkflowAction(makeInput({ autoActive: true, autoPaused: true }));
      assert.equal(result.primary?.label, "Resume Auto");
      assert.equal(result.primary?.command, "/gsd auto");
    });

    test("does not show 'Start Auto' when autoActive is true", () => {
      const result = deriveWorkflowAction(makeInput({ autoActive: true, phase: "executing" }));
      assert.notEqual(
        result.primary?.label,
        "Start Auto",
        "must not show 'Start Auto' when auto-mode is already active",
      );
    });
  });

  describe("other phases", () => {
    test("shows 'Plan' during planning phase", () => {
      const result = deriveWorkflowAction(makeInput({ phase: "planning" }));
      assert.equal(result.primary?.label, "Plan");
    });

    test("shows 'New Milestone' when phase is complete", () => {
      const result = deriveWorkflowAction(makeInput({ phase: "complete" }));
      assert.equal(result.primary?.label, "New Milestone");
      assert.equal(result.isNewMilestone, true);
    });

    test("shows 'Initialize Project' for pre-planning without milestones", () => {
      const result = deriveWorkflowAction(makeInput({ phase: "pre-planning", hasMilestones: false }));
      assert.equal(result.primary?.label, "Initialize Project");
    });
  });

  describe("disabled states", () => {
    test("disabled when command is in flight", () => {
      const result = deriveWorkflowAction(makeInput({ commandInFlight: "/gsd auto" }));
      assert.equal(result.disabled, true);
      assert.equal(result.disabledReason, "Command in progress");
    });

    test("disabled when boot status is not ready", () => {
      const result = deriveWorkflowAction(makeInput({ bootStatus: "loading" }));
      assert.equal(result.disabled, true);
    });
  });
});
