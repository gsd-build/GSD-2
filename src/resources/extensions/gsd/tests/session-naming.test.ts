/**
 * Tests for auto-mode session naming (buildSessionName).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildSessionName } from "../auto/run-unit.ts";

describe("buildSessionName", () => {
  test("includes unitType, unitId, and milestoneId", () => {
    const name = buildSessionName("execute-task", "M001/S01/T03", "M001-eh88as");
    assert.equal(name, "execute-task · M001/S01/T03 · M001-eh88as");
  });

  test("includes label when provided", () => {
    const name = buildSessionName("execute-task", "M001/S01/T03", "M001-eh88as", "Fix login validation");
    assert.equal(name, "execute-task · M001/S01/T03 · M001-eh88as · Fix login validation");
  });

  test("omits label when undefined", () => {
    const name = buildSessionName("plan-slice", "M001/S02", "M001-eh88as");
    assert.ok(!name.includes("undefined"));
    assert.equal(name, "plan-slice · M001/S02 · M001-eh88as");
  });

  test("omits milestoneId when null", () => {
    const name = buildSessionName("research-milestone", "M001", null);
    assert.equal(name, "research-milestone · M001");
  });

  test("omits milestoneId when null but includes label", () => {
    const name = buildSessionName("research-milestone", "M001", null, "Platform Foundation");
    assert.equal(name, "research-milestone · M001 · Platform Foundation");
  });

  test("handles empty unitId", () => {
    const name = buildSessionName("reassess-roadmap", "", "M001-eh88as");
    assert.equal(name, "reassess-roadmap · M001-eh88as");
  });
});
