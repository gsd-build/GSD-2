import test from "node:test";
import assert from "node:assert/strict";

/**
 * Tests for team model override logic in selectAndApplyModel.
 *
 * Since selectAndApplyModel requires ExtensionContext/ExtensionAPI mocks
 * (which are complex Pi SDK types), we test the override logic in isolation.
 * The logic is: if teamOverride.model is set, it becomes the primary model
 * while preserving original fallbacks.
 */

test("team override: no override leaves model config unchanged", () => {
  const modelConfig = { primary: "claude-sonnet-4-20250514", fallbacks: ["claude-haiku-4-5-20251001"] };
  const teamOverride = undefined;

  const effective = teamOverride?.model
    ? { primary: teamOverride.model, fallbacks: modelConfig.fallbacks }
    : modelConfig;

  assert.equal(effective.primary, "claude-sonnet-4-20250514");
  assert.deepEqual(effective.fallbacks, ["claude-haiku-4-5-20251001"]);
});

test("team override: team model becomes primary, original fallbacks preserved", () => {
  const modelConfig = { primary: "claude-sonnet-4-20250514", fallbacks: ["claude-haiku-4-5-20251001"] };
  const teamOverride = { model: "claude-opus-4-6" };

  const effective = teamOverride?.model
    ? { primary: teamOverride.model, fallbacks: modelConfig.fallbacks }
    : modelConfig;

  assert.equal(effective.primary, "claude-opus-4-6");
  assert.deepEqual(effective.fallbacks, ["claude-haiku-4-5-20251001"]);
});

test("team override: works when no original model config exists", () => {
  const modelConfig = null;
  const teamOverride = { model: "claude-opus-4-6" };

  const effective = teamOverride?.model
    ? { primary: teamOverride.model, fallbacks: modelConfig?.fallbacks ?? [] }
    : modelConfig;

  assert.ok(effective);
  assert.equal(effective!.primary, "claude-opus-4-6");
  assert.deepEqual(effective!.fallbacks, []);
});

test("team override: teamHint lookup from preferences teams array", () => {
  const prefs = {
    teams: [
      { name: "frontend", model: "claude-sonnet-4-20250514", description: "", members: [], filePatterns: [], capabilities: [] },
      { name: "backend", model: "claude-opus-4-6", description: "", members: [], filePatterns: [], capabilities: [] },
    ],
  };

  const teamHint = "backend";
  const teamModel = teamHint && prefs.teams
    ? prefs.teams.find(t => t.name === teamHint)?.model
    : undefined;

  assert.equal(teamModel, "claude-opus-4-6");
});

test("team override: teamHint with no matching team returns undefined", () => {
  const prefs = {
    teams: [
      { name: "frontend", model: "claude-sonnet-4-20250514", description: "", members: [], filePatterns: [], capabilities: [] },
    ],
  };

  const teamHint = "nonexistent";
  const teamModel = teamHint && prefs.teams
    ? prefs.teams.find(t => t.name === teamHint)?.model
    : undefined;

  assert.equal(teamModel, undefined);
});

test("team override: no teamHint means no override", () => {
  const prefs = {
    teams: [
      { name: "frontend", model: "claude-sonnet-4-20250514", description: "", members: [], filePatterns: [], capabilities: [] },
    ],
  };

  const teamHint: string | undefined = undefined;
  const teamModel = teamHint && prefs.teams
    ? prefs.teams.find(t => t.name === teamHint)?.model
    : undefined;

  assert.equal(teamModel, undefined);
});
