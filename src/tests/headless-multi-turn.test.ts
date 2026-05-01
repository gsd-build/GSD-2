/**
 * Regression test for #3547: discuss and plan must be classified as
 * multi-turn commands in headless mode.
 *
 * Previously this test grep'd `headless.ts` for the literal identifier
 * `discuss` inside the `isMultiTurnCommand =` RHS, which would pass on a
 * comment, an unrelated string constant, or a regression that left the
 * identifier in place but stopped using it. The runtime-state helper now
 * exposes the classification directly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { getHeadlessRuntimeState } from "../headless-events.js";

test("headless runtime classifies discuss and plan as multi-turn (#3547)", () => {
  assert.equal(getHeadlessRuntimeState("discuss").isMultiTurnCommand, true);
  assert.equal(getHeadlessRuntimeState("plan").isMultiTurnCommand, true);
  assert.equal(getHeadlessRuntimeState("auto").isMultiTurnCommand, true);
  assert.equal(getHeadlessRuntimeState("next").isMultiTurnCommand, true);
  assert.equal(getHeadlessRuntimeState("new-milestone").isMultiTurnCommand, false);
});

test("headless runtime classifies single-turn commands as non-multi-turn", () => {
  for (const cmd of ["ask", "chat", "help", "version", "", "random-cmd"]) {
    assert.equal(
      getHeadlessRuntimeState(cmd).isMultiTurnCommand,
      false,
      `${cmd} should not be multi-turn`,
    );
  }
});
