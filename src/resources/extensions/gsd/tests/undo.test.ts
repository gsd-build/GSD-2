import test from "node:test";
import assert from "node:assert/strict";

import { extractCommitShas } from "../undo.js";

test("extractCommitShas returns unique commit hashes from git output blocks", () => {
  const content = [
    "[main abc1234] first commit",
    "[feature deadbeef] second commit",
    "[main abc1234] duplicate commit",
  ].join("\n");

  assert.deepEqual(extractCommitShas(content), ["abc1234", "deadbeef"]);
});

test("extractCommitShas ignores malformed commit tokens", () => {
  const content = [
    "[main abc1234; touch /tmp/pwned] not a real sha token",
    "[main not-a-sha] ignored",
    "[main 1234567] valid",
  ].join("\n");

  assert.deepEqual(extractCommitShas(content), ["1234567"]);
});
