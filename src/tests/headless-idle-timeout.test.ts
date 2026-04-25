import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_HEADLESS_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  NEW_MILESTONE_HEADLESS_TIMEOUT_MS,
  NEW_MILESTONE_IDLE_TIMEOUT_MS,
  getHeadlessIdleTimeout,
  getHeadlessRuntimeState,
  resolveHeadlessOverallTimeout,
  shouldArmHeadlessIdleTimer,
} from "../headless-events.js";

test("getHeadlessIdleTimeout disables idle fallback for auto-mode (#3428)", () => {
  assert.equal(getHeadlessIdleTimeout("auto"), 0);
});

test("getHeadlessIdleTimeout keeps extended timeout for new-milestone", () => {
  assert.equal(getHeadlessIdleTimeout("new-milestone"), NEW_MILESTONE_IDLE_TIMEOUT_MS);
});

test("getHeadlessIdleTimeout keeps default timeout for ordinary commands", () => {
  assert.equal(getHeadlessIdleTimeout("next"), IDLE_TIMEOUT_MS);
});

test("shouldArmHeadlessIdleTimer folds all idle-timer gates into one decision", () => {
  assert.equal(shouldArmHeadlessIdleTimer(0, 0, IDLE_TIMEOUT_MS), false);
  assert.equal(shouldArmHeadlessIdleTimer(1, 1, IDLE_TIMEOUT_MS), false);
  assert.equal(shouldArmHeadlessIdleTimer(1, 0, 0), false);
  assert.equal(shouldArmHeadlessIdleTimer(2, 0, IDLE_TIMEOUT_MS), true);
});

test("new-milestone --auto switches the chained auto phase to auto idle policy", () => {
  const milestonePhase = getHeadlessRuntimeState("new-milestone");
  assert.equal(milestonePhase.command, "new-milestone");
  assert.equal(milestonePhase.idleTimeoutMs, NEW_MILESTONE_IDLE_TIMEOUT_MS);
  assert.equal(milestonePhase.isMultiTurnCommand, false);
  assert.equal(shouldArmHeadlessIdleTimer(2, 0, milestonePhase.idleTimeoutMs), true);

  const chainedAutoPhase = getHeadlessRuntimeState("auto");
  assert.equal(chainedAutoPhase.command, "auto");
  assert.equal(chainedAutoPhase.idleTimeoutMs, 0);
  assert.equal(chainedAutoPhase.isMultiTurnCommand, true);
  assert.equal(
    shouldArmHeadlessIdleTimer(2, 0, chainedAutoPhase.idleTimeoutMs),
    false,
    "a chained auto phase must not re-arm the generic idle timer",
  );
});

test("resolveHeadlessOverallTimeout preserves explicit user timeouts", () => {
  assert.equal(
    resolveHeadlessOverallTimeout("auto", DEFAULT_HEADLESS_TIMEOUT_MS, true),
    DEFAULT_HEADLESS_TIMEOUT_MS,
  );
  assert.equal(
    resolveHeadlessOverallTimeout("new-milestone", DEFAULT_HEADLESS_TIMEOUT_MS, true),
    DEFAULT_HEADLESS_TIMEOUT_MS,
  );
});

test("resolveHeadlessOverallTimeout applies command defaults only when timeout is implicit", () => {
  assert.equal(resolveHeadlessOverallTimeout("auto", DEFAULT_HEADLESS_TIMEOUT_MS, false), 0);
  assert.equal(
    resolveHeadlessOverallTimeout("new-milestone", DEFAULT_HEADLESS_TIMEOUT_MS, false),
    NEW_MILESTONE_HEADLESS_TIMEOUT_MS,
  );
  assert.equal(resolveHeadlessOverallTimeout("next", DEFAULT_HEADLESS_TIMEOUT_MS, false), DEFAULT_HEADLESS_TIMEOUT_MS);
  assert.equal(resolveHeadlessOverallTimeout("auto", 42_000, false), 42_000);
});
