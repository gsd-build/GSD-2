/**
 * Behavioural regression test for #2645 — double mergeAndExit guard.
 *
 * AutoSession.milestoneMergedInPhases is the producer-side flag set by the
 * "complete" / "all-milestones-complete" branches in phases.ts after they
 * call mergeAndExit. stopAuto reads it to skip the redundant Step-4 merge
 * (which previously failed because the branch was already deleted).
 *
 * Refs #4829 (rewrite from positional source-grep on phases.ts/auto.ts).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { AutoSession } from "../auto/session.ts";

describe("AutoSession.milestoneMergedInPhases (#2645)", () => {
  test("defaults to false on a fresh session", () => {
    const session = new AutoSession();
    assert.equal(
      session.milestoneMergedInPhases,
      false,
      "new session should have milestoneMergedInPhases = false",
    );
  });

  test("reset() clears the flag back to false", () => {
    const session = new AutoSession();
    session.milestoneMergedInPhases = true;
    session.reset();
    assert.equal(
      session.milestoneMergedInPhases,
      false,
      "reset() should clear milestoneMergedInPhases back to false",
    );
  });
});
