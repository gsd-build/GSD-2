import test from "node:test";
import assert from "node:assert/strict";
import { nextMilestoneId, maxMilestoneNum } from "../guided-flow.ts";

test("nextMilestoneId: empty array returns M001", () => {
  assert.equal(maxMilestoneNum([]), 0);
  assert.equal(nextMilestoneId([]), "M001");
});

test("nextMilestoneId: sequential IDs return next in sequence", () => {
  assert.equal(nextMilestoneId(["M001", "M002", "M003"]), "M004");
  assert.equal(maxMilestoneNum(["M001", "M002", "M003"]), 3);
});

test("nextMilestoneId: gaps use max, not fill", () => {
  assert.equal(nextMilestoneId(["M001", "M003"]), "M004");
  assert.equal(maxMilestoneNum(["M001", "M003"]), 3);
});

test("nextMilestoneId: non-numeric directory names ignored", () => {
  assert.equal(nextMilestoneId(["M001", "notes", ".DS_Store", "M003"]), "M004");
  assert.equal(maxMilestoneNum(["M001", "notes", ".DS_Store", "M003"]), 3);
});
