import test from "node:test";
import assert from "node:assert/strict";

import { shouldValidateResolvedProjectCwd } from "../commands.ts";

test("shouldValidateResolvedProjectCwd returns false for normal nested repo directories", () => {
  assert.equal(
    shouldValidateResolvedProjectCwd("/Users/test/home/project/src", "/Users/test/home/project"),
    false,
  );
});

test("shouldValidateResolvedProjectCwd returns true for GSD worktree paths", () => {
  assert.equal(
    shouldValidateResolvedProjectCwd(
      "/Users/test/home/.gsd/worktrees/M001/src",
      "/Users/test/home",
    ),
    true,
  );
});

test("shouldValidateResolvedProjectCwd returns false when already at the resolved root", () => {
  assert.equal(
    shouldValidateResolvedProjectCwd("/Users/test/home/project", "/Users/test/home/project"),
    false,
  );
});
