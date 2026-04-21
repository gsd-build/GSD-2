import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  IDLE_TIMEOUT_MS,
  NEW_MILESTONE_IDLE_TIMEOUT_MS,
  getHeadlessIdleTimeout,
  shouldArmHeadlessIdleTimeout,
  shouldArmIdleTimeout,
} from "../headless-events.js";

const headlessSource = readFileSync(new URL("../headless.ts", import.meta.url), "utf8");

test("getHeadlessIdleTimeout disables idle fallback for auto-mode (#3428)", () => {
  assert.equal(getHeadlessIdleTimeout("auto"), 0);
});

test("getHeadlessIdleTimeout keeps extended timeout for new-milestone", () => {
  assert.equal(getHeadlessIdleTimeout("new-milestone"), NEW_MILESTONE_IDLE_TIMEOUT_MS);
});

test("getHeadlessIdleTimeout keeps default timeout for ordinary commands", () => {
  assert.equal(getHeadlessIdleTimeout("next"), IDLE_TIMEOUT_MS);
});

test("shouldArmIdleTimeout requires both tool activity and a positive timeout", () => {
  assert.equal(shouldArmIdleTimeout(0, IDLE_TIMEOUT_MS), false);
  assert.equal(shouldArmIdleTimeout(1, 0), false);
  assert.equal(shouldArmIdleTimeout(2, IDLE_TIMEOUT_MS), true);
});

test("shouldArmHeadlessIdleTimeout stays disabled while interactive tools are pending", () => {
  assert.equal(shouldArmHeadlessIdleTimeout(0, 0), false);
  assert.equal(shouldArmHeadlessIdleTimeout(1, 1), false);
  assert.equal(shouldArmHeadlessIdleTimeout(2, 0), true);
});

test("new-milestone --auto switches the chained auto phase to auto idle policy", () => {
  assert.match(
    headlessSource,
    /let\s+currentCommand\s*=\s*options\.command/,
    "headless command state must be mutable when a command chains into another mode",
  );
  assert.match(
    headlessSource,
    /let\s+effectiveIdleTimeout\s*=\s*getHeadlessIdleTimeout\(currentCommand\)/,
    "the idle policy must be mutable when a headless command chains into auto-mode",
  );
  assert.match(
    headlessSource,
    /isQuickCommand\(currentCommand,\s*options\.commandArgs\)/,
    "quick-command completion should use the current chained command, not only the initial command",
  );

  const chainStart = headlessSource.indexOf("if (isNewMilestone && options.auto && milestoneReady");
  assert.notEqual(chainStart, -1, "expected new-milestone --auto chaining block");
  const chainBlock = headlessSource.slice(chainStart, headlessSource.indexOf("try {", chainStart));

  assert.match(chainBlock, /clearTimeout\(idleTimer\)/, "chaining into auto-mode should clear any milestone idle timer");
  assert.match(chainBlock, /idleTimer\s*=\s*null/, "cleared idle timers should not remain addressable");
  assert.match(chainBlock, /currentCommand\s*=\s*['"]auto['"]/, "the chained phase should switch current command state to auto");
  assert.match(chainBlock, /isMultiTurnCommand\s*=\s*true/, "the chained auto phase should use multi-turn completion semantics");
  assert.match(
    chainBlock,
    /effectiveIdleTimeout\s*=\s*getHeadlessIdleTimeout\(currentCommand\)/,
    "the chained auto phase should use auto-mode idle timeout semantics",
  );
});
