/**
 * Regression test for #3453: dynamic model routing must be disabled for
 * flat-rate providers like GitHub Copilot where all models cost the same
 * per request — routing only degrades quality with no cost benefit.
 */

import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isFlatRateProvider, resolvePreferredModelConfig } from "../auto-model-selection.ts";

describe("flat-rate provider routing guard (#3453)", () => {
  const originalGsdHome = process.env.GSD_HOME;
  const tempHomes: string[] = [];

  afterEach(() => {
    process.env.GSD_HOME = originalGsdHome;
    for (const dir of tempHomes.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function withIsolatedGsdHome(): void {
    const tempHome = mkdtempSync(join(tmpdir(), "gsd-flat-rate-home-"));
    tempHomes.push(tempHome);
    process.env.GSD_HOME = join(tempHome, ".gsd");
  }

  test("isFlatRateProvider returns true for github-copilot", () => {
    assert.equal(isFlatRateProvider("github-copilot"), true);
  });

  test("isFlatRateProvider returns true for copilot alias", () => {
    assert.equal(isFlatRateProvider("copilot"), true);
  });

  test("isFlatRateProvider is case-insensitive", () => {
    assert.equal(isFlatRateProvider("GitHub-Copilot"), true);
    assert.equal(isFlatRateProvider("GITHUB-COPILOT"), true);
    assert.equal(isFlatRateProvider("Copilot"), true);
  });

  test("isFlatRateProvider returns false for anthropic", () => {
    assert.equal(isFlatRateProvider("anthropic"), false);
  });

  test("isFlatRateProvider returns false for openai", () => {
    assert.equal(isFlatRateProvider("openai"), false);
  });

  test("resolvePreferredModelConfig returns undefined for copilot start model", () => {
    withIsolatedGsdHome();

    // When the user's start model is on a flat-rate provider,
    // resolvePreferredModelConfig should not synthesize a routing
    // config from tier_models — it should return undefined so the
    // user's selected model is preserved.
    const result = resolvePreferredModelConfig("execute-task", {
      provider: "github-copilot",
      id: "claude-sonnet-4",
    });

    // Should be undefined (no routing config created for flat-rate)
    // Note: this only tests the guard — if explicit per-unit config exists
    // in preferences, that takes precedence regardless.
    assert.equal(result, undefined, "Should not create routing config for copilot");
  });
});
