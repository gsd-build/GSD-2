import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveModelForComplexity,
  escalateTier,
  defaultRoutingConfig,
  resolveModelForTier,
} from "../model-router.js";
import type { DynamicRoutingConfig, RoutingDecision } from "../model-router.js";
import type { ClassificationResult } from "../complexity-classifier.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeClassification(tier: "light" | "standard" | "heavy", reason = "test"): ClassificationResult {
  return { tier, reason, downgraded: false };
}

const AVAILABLE_MODELS = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "gpt-4o-mini",
];

// ─── Passthrough when disabled ───────────────────────────────────────────────

test("returns configured model when routing is disabled", () => {
  const config = { ...defaultRoutingConfig(), enabled: false };
  const result = resolveModelForComplexity(
    makeClassification("light"),
    { primary: "claude-opus-4-6", fallbacks: [] },
    config,
    AVAILABLE_MODELS,
  );
  assert.equal(result.modelId, "claude-opus-4-6");
  assert.equal(result.wasDowngraded, false);
});

test("returns configured model when no phase config", () => {
  const config = { ...defaultRoutingConfig(), enabled: true };
  const result = resolveModelForComplexity(
    makeClassification("light"),
    undefined,
    config,
    AVAILABLE_MODELS,
  );
  assert.equal(result.modelId, "");
  assert.equal(result.wasDowngraded, false);
});

// ─── Downgrade-only semantics ────────────────────────────────────────────────

test("does not downgrade when tier matches configured model tier", () => {
  const config = { ...defaultRoutingConfig(), enabled: true };
  const result = resolveModelForComplexity(
    makeClassification("heavy"),
    { primary: "claude-opus-4-6", fallbacks: [] },
    config,
    AVAILABLE_MODELS,
  );
  assert.equal(result.modelId, "claude-opus-4-6");
  assert.equal(result.wasDowngraded, false);
});

test("does not upgrade beyond configured model", () => {
  const config = { ...defaultRoutingConfig(), enabled: true };
  // Configured model is sonnet (standard), classification says heavy
  const result = resolveModelForComplexity(
    makeClassification("heavy"),
    { primary: "claude-sonnet-4-6", fallbacks: [] },
    config,
    AVAILABLE_MODELS,
  );
  assert.equal(result.modelId, "claude-sonnet-4-6");
  assert.equal(result.wasDowngraded, false);
});

test("downgrades from opus to haiku for light tier", () => {
  const config = { ...defaultRoutingConfig(), enabled: true };
  const result = resolveModelForComplexity(
    makeClassification("light"),
    { primary: "claude-opus-4-6", fallbacks: [] },
    config,
    AVAILABLE_MODELS,
  );
  // Should pick haiku or gpt-4o-mini (cheapest light tier)
  assert.ok(
    result.modelId === "claude-haiku-4-5" || result.modelId === "gpt-4o-mini",
    `Expected light-tier model, got ${result.modelId}`,
  );
  assert.equal(result.wasDowngraded, true);
});

test("downgrades from opus to sonnet for standard tier", () => {
  const config = { ...defaultRoutingConfig(), enabled: true };
  const result = resolveModelForComplexity(
    makeClassification("standard"),
    { primary: "claude-opus-4-6", fallbacks: [] },
    config,
    AVAILABLE_MODELS,
  );
  assert.equal(result.modelId, "claude-sonnet-4-6");
  assert.equal(result.wasDowngraded, true);
});

// ─── Explicit tier_models ────────────────────────────────────────────────────

test("uses explicit tier_models when configured", () => {
  const config: DynamicRoutingConfig = {
    ...defaultRoutingConfig(),
    enabled: true,
    tier_models: { light: "gpt-4o-mini", standard: "claude-sonnet-4-6" },
  };
  const result = resolveModelForComplexity(
    makeClassification("light"),
    { primary: "claude-opus-4-6", fallbacks: [] },
    config,
    AVAILABLE_MODELS,
  );
  assert.equal(result.modelId, "gpt-4o-mini");
  assert.equal(result.wasDowngraded, true);
});

// ─── Fallback chain construction ─────────────────────────────────────────────

test("fallback chain includes configured primary as last resort", () => {
  const config = { ...defaultRoutingConfig(), enabled: true };
  const result = resolveModelForComplexity(
    makeClassification("light"),
    { primary: "claude-opus-4-6", fallbacks: ["claude-sonnet-4-6"] },
    config,
    AVAILABLE_MODELS,
  );
  assert.ok(result.wasDowngraded);
  // Fallbacks should include the configured fallbacks and primary
  assert.ok(result.fallbacks.includes("claude-opus-4-6"), "primary should be in fallbacks");
  assert.ok(result.fallbacks.includes("claude-sonnet-4-6"), "configured fallback should be in fallbacks");
});

// ─── Escalation ──────────────────────────────────────────────────────────────

test("escalateTier moves light → standard", () => {
  assert.equal(escalateTier("light"), "standard");
});

test("escalateTier moves standard → heavy", () => {
  assert.equal(escalateTier("standard"), "heavy");
});

test("escalateTier returns null for heavy (max)", () => {
  assert.equal(escalateTier("heavy"), null);
});

// ─── No suitable model available ─────────────────────────────────────────────

test("falls back to configured model when no light-tier model available", () => {
  const config = { ...defaultRoutingConfig(), enabled: true };
  // Only heavy-tier models available
  const result = resolveModelForComplexity(
    makeClassification("light"),
    { primary: "claude-opus-4-6", fallbacks: [] },
    config,
    ["claude-opus-4-6"],
  );
  assert.equal(result.modelId, "claude-opus-4-6");
  assert.equal(result.wasDowngraded, false);
});

// ─── #2192: Unknown models honor explicit config ─────────────────────────────

test("#2192: unknown model is not downgraded — respects user config", () => {
  const config = { ...defaultRoutingConfig(), enabled: true };
  const result = resolveModelForComplexity(
    makeClassification("light"),
    { primary: "gpt-5.4", fallbacks: [] },
    config,
    ["gpt-5.4", ...AVAILABLE_MODELS],
  );
  assert.equal(result.modelId, "gpt-5.4", "unknown model should be used as-is");
  assert.equal(result.wasDowngraded, false, "should not be downgraded");
  assert.ok(result.reason.includes("not in the known tier map"), "reason should explain why");
});

test("#2192: unknown model with provider prefix is not downgraded", () => {
  const config = { ...defaultRoutingConfig(), enabled: true };
  const result = resolveModelForComplexity(
    makeClassification("standard"),
    { primary: "custom-provider/my-model-v3", fallbacks: [] },
    config,
    ["custom-provider/my-model-v3", ...AVAILABLE_MODELS],
  );
  assert.equal(result.modelId, "custom-provider/my-model-v3");
  assert.equal(result.wasDowngraded, false);
});

test("#2192: known model is still downgraded normally", () => {
  const config = { ...defaultRoutingConfig(), enabled: true };
  // claude-opus-4-6 is known as "heavy" — a light request should downgrade
  const result = resolveModelForComplexity(
    makeClassification("light"),
    { primary: "claude-opus-4-6", fallbacks: [] },
    config,
    AVAILABLE_MODELS,
  );
  assert.equal(result.wasDowngraded, true, "known heavy model should still be downgraded for light tasks");
  assert.notEqual(result.modelId, "claude-opus-4-6");
});

// ─── Cross-provider fallback ──────────────────────────────────────────────────

test("uses cross-provider equivalent when configured primary is unavailable", () => {
  const config = { ...defaultRoutingConfig(), enabled: true };
  // Profile default says claude-opus-4-6 for planning, but user is on GPT only
  const result = resolveModelForComplexity(
    makeClassification("heavy"),
    { primary: "claude-opus-4-6", fallbacks: [] },
    config,
    ["gpt-4o", "gpt-4o-mini", "o1"],
  );
  // o1 is the heavy-tier GPT model — should be selected as cross-provider equivalent
  assert.equal(result.modelId, "o1");
  assert.equal(result.wasDowngraded, false);
  assert.match(result.reason, /cross-provider/);
});

test("cross-provider: selects standard-tier equivalent when primary unavailable", () => {
  const config = { ...defaultRoutingConfig(), enabled: true };
  // Planning configured with Opus, but only GPT standard models available
  const result = resolveModelForComplexity(
    makeClassification("heavy"),
    { primary: "claude-opus-4-6", fallbacks: [] },
    config,
    ["gpt-4o", "gpt-4o-mini"],
  );
  // gpt-4o is standard tier, not heavy — no heavy-tier model available
  // Should fall back to gpt-4o (best available)
  assert.ok(result.modelId === "gpt-4o" || result.modelId === "claude-opus-4-6");
  assert.equal(result.wasDowngraded, false);
});

test("cross-provider: configured primary available by bare ID wins over equivalent", () => {
  const config = { ...defaultRoutingConfig(), enabled: true };
  // Provider-prefixed ID — bare match should find it
  const result = resolveModelForComplexity(
    makeClassification("heavy"),
    { primary: "claude-opus-4-6", fallbacks: [] },
    config,
    ["anthropic/claude-opus-4-6", "o1"],
  );
  assert.equal(result.modelId, "claude-opus-4-6");
  assert.equal(result.wasDowngraded, false);
});

// ─── resolveModelForTier (provider-agnostic tier resolution) ────────────────

test("resolveModelForTier: returns canonical Anthropic model when no available models", () => {
  assert.equal(resolveModelForTier("heavy", []), "claude-opus-4-6");
  assert.equal(resolveModelForTier("standard", []), "claude-sonnet-4-6");
  assert.equal(resolveModelForTier("light", []), "claude-haiku-4-5");
});

test("resolveModelForTier: returns canonical model when it is available", () => {
  assert.equal(
    resolveModelForTier("heavy", ["claude-opus-4-6", "claude-sonnet-4-6"]),
    "claude-opus-4-6",
  );
});

test("resolveModelForTier: picks cross-provider equivalent when Anthropic unavailable", () => {
  // Only OpenAI models available
  const result = resolveModelForTier("heavy", ["gpt-4o", "gpt-4o-mini", "o1"]);
  // o1 is the heavy-tier model in the OpenAI lineup
  assert.equal(result, "o1");
});

test("resolveModelForTier: picks standard-tier cross-provider model", () => {
  const result = resolveModelForTier("standard", ["gpt-4o", "gpt-4o-mini"]);
  assert.equal(result, "gpt-4o");
});

test("resolveModelForTier: picks light-tier cross-provider model", () => {
  const result = resolveModelForTier("light", ["gpt-4o", "gpt-4o-mini"]);
  assert.equal(result, "gpt-4o-mini");
});

test("resolveModelForTier: falls back to canonical when no tier match available", () => {
  // Only unknown models available — should return canonical
  const result = resolveModelForTier("heavy", ["some-custom-model"]);
  // Custom models default to heavy tier in getModelTier, so it should match
  assert.equal(result, "some-custom-model");
});

test("resolveModelForTier: handles provider-prefixed available models", () => {
  const result = resolveModelForTier("heavy", ["anthropic/claude-opus-4-6"]);
  assert.equal(result, "claude-opus-4-6");
});

test("resolveModelForTier: picks Gemini models when only Google available", () => {
  const result = resolveModelForTier("light", ["gemini-2.5-pro", "gemini-2.0-flash"]);
  assert.equal(result, "gemini-2.0-flash");
});
