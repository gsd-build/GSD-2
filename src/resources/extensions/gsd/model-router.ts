// GSD Extension — Dynamic Model Router
// Maps complexity tiers to models, enforcing downgrade-only semantics.
// The user's configured model is always the ceiling.

import type { ComplexityTier, ClassificationResult } from "./complexity-classifier.js";
import { tierOrdinal } from "./complexity-classifier.js";
import type { ResolvedModelConfig } from "./preferences.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DynamicRoutingConfig {
  enabled?: boolean;
  tier_models?: {
    light?: string;
    standard?: string;
    heavy?: string;
  };
  escalate_on_failure?: boolean;   // default: true
  budget_pressure?: boolean;       // default: true
  cross_provider?: boolean;        // default: true
  hooks?: boolean;                 // default: true
}

export interface RoutingDecision {
  /** The model ID to use (may be downgraded from configured) */
  modelId: string;
  /** Fallback chain: [selected_model, ...configured_fallbacks, configured_primary] */
  fallbacks: string[];
  /** The complexity tier that drove this decision */
  tier: ComplexityTier;
  /** True if the model was downgraded from the configured primary */
  wasDowngraded: boolean;
  /** Human-readable reason for this decision */
  reason: string;
}

// ─── Known Model Tiers ───────────────────────────────────────────────────────
// Maps known model IDs to their capability tier. Used when tier_models is not
// explicitly configured to pick the best available model for each tier.

const MODEL_CAPABILITY_TIER: Record<string, ComplexityTier> = {
  // Light-tier models (cheapest)
  "claude-haiku-4-5": "light",
  "claude-3-5-haiku-latest": "light",
  "claude-3-haiku-20240307": "light",
  "gpt-4o-mini": "light",
  "gemini-2.0-flash": "light",
  "gemini-flash-2.0": "light",

  // Standard-tier models
  "claude-sonnet-4-6": "standard",
  "claude-sonnet-4-5-20250514": "standard",
  "claude-3-5-sonnet-latest": "standard",
  "gpt-4o": "standard",
  "gemini-2.5-pro": "standard",
  "deepseek-chat": "standard",

  // Heavy-tier models (most capable)
  "claude-opus-4-6": "heavy",
  "claude-3-opus-latest": "heavy",
  "gpt-4-turbo": "heavy",
  "o1": "heavy",
  "o3": "heavy",
};

// ─── Cost Table (per 1K input tokens, approximate USD) ───────────────────────
// Used for cross-provider cost comparison when multiple providers offer
// the same capability tier.

const MODEL_COST_PER_1K_INPUT: Record<string, number> = {
  "claude-haiku-4-5": 0.0008,
  "claude-3-5-haiku-latest": 0.0008,
  "claude-sonnet-4-6": 0.003,
  "claude-sonnet-4-5-20250514": 0.003,
  "claude-opus-4-6": 0.015,
  "gpt-4o-mini": 0.00015,
  "gpt-4o": 0.0025,
  "gemini-2.0-flash": 0.0001,
  "gemini-2.5-pro": 0.00125,
  "deepseek-chat": 0.00014,
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve the model to use for a given complexity tier.
 *
 * Downgrade-only: the returned model is always equal to or cheaper than
 * the user's configured primary model. Never upgrades beyond configuration.
 *
 * @param classification  The complexity classification result
 * @param phaseConfig     The user's configured model for this phase (ceiling)
 * @param routingConfig   Dynamic routing configuration
 * @param availableModelIds  List of available model IDs (from registry)
 */
export function resolveModelForComplexity(
  classification: ClassificationResult,
  phaseConfig: ResolvedModelConfig | undefined,
  routingConfig: DynamicRoutingConfig,
  availableModelIds: string[],
): RoutingDecision {
  // If no phase config or routing disabled, pass through
  if (!phaseConfig || !routingConfig.enabled) {
    return {
      modelId: phaseConfig?.primary ?? "",
      fallbacks: phaseConfig?.fallbacks ?? [],
      tier: classification.tier,
      wasDowngraded: false,
      reason: "dynamic routing disabled or no phase config",
    };
  }

  const configuredPrimary = phaseConfig.primary;
  const configuredTier = getModelTier(configuredPrimary);
  const requestedTier = classification.tier;

  // If the configured model is unknown (not in MODEL_CAPABILITY_TIER),
  // honor the user's explicit choice — don't downgrade based on a guess.
  // Unknown models default to "heavy" in getModelTier, which makes every
  // standard/light unit get downgraded to tier_models, silently ignoring
  // the user's configuration. (#2192)
  if (!isKnownModel(configuredPrimary)) {
    return {
      modelId: configuredPrimary,
      fallbacks: phaseConfig.fallbacks,
      tier: requestedTier,
      wasDowngraded: false,
      reason: `configured model "${configuredPrimary}" is not in the known tier map — honoring explicit config`,
    };
  }

  // Downgrade-only: if requested tier >= configured tier, no change
  if (tierOrdinal(requestedTier) >= tierOrdinal(configuredTier)) {
    // If the configured primary is directly available, use it
    if (isModelAvailable(configuredPrimary, availableModelIds)) {
      return {
        modelId: configuredPrimary,
        fallbacks: phaseConfig.fallbacks,
        tier: requestedTier,
        wasDowngraded: false,
        reason: `tier ${requestedTier} >= configured ${configuredTier}`,
      };
    }

    // Configured primary is unavailable (e.g. Anthropic model configured but
    // running on a non-Anthropic provider). Find the best available model at
    // the same capability tier so routing still works cross-provider.
    const crossProviderEquivalent = findModelForTier(
      configuredTier,
      routingConfig,
      availableModelIds,
      routingConfig.cross_provider !== false,
    );

    return {
      modelId: crossProviderEquivalent ?? configuredPrimary,
      fallbacks: crossProviderEquivalent
        ? [...phaseConfig.fallbacks.filter(f => f !== crossProviderEquivalent), configuredPrimary]
        : phaseConfig.fallbacks,
      tier: requestedTier,
      wasDowngraded: false,
      reason: crossProviderEquivalent
        ? `cross-provider ${configuredTier}-tier equivalent`
        : `tier ${requestedTier} >= configured ${configuredTier}`,
    };
  }

  // Find the best model for the requested tier
  const targetModelId = findModelForTier(
    requestedTier,
    routingConfig,
    availableModelIds,
    routingConfig.cross_provider !== false,
  );

  if (!targetModelId) {
    // No suitable model found — use configured primary
    return {
      modelId: configuredPrimary,
      fallbacks: phaseConfig.fallbacks,
      tier: requestedTier,
      wasDowngraded: false,
      reason: `no ${requestedTier}-tier model available`,
    };
  }

  // Build fallback chain: [downgraded_model, ...configured_fallbacks, configured_primary]
  const fallbacks = [
    ...phaseConfig.fallbacks.filter(f => f !== targetModelId),
    configuredPrimary,
  ].filter(f => f !== targetModelId);

  return {
    modelId: targetModelId,
    fallbacks,
    tier: requestedTier,
    wasDowngraded: true,
    reason: classification.reason,
  };
}

/**
 * Escalate to the next tier after a failure.
 * Returns the new tier, or null if already at heavy (max).
 */
export function escalateTier(currentTier: ComplexityTier): ComplexityTier | null {
  switch (currentTier) {
    case "light": return "standard";
    case "standard": return "heavy";
    case "heavy": return null;
  }
}

/**
 * Get the default routing config (all features enabled).
 */
export function defaultRoutingConfig(): DynamicRoutingConfig {
  return {
    enabled: false,
    escalate_on_failure: true,
    budget_pressure: true,
    cross_provider: true,
    hooks: true,
  };
}

// ─── Tier-Based Model Resolution (for profile defaults) ─────────────────────

/**
 * Canonical Anthropic model IDs per tier. Used as the reference defaults
 * when the user's available models include Anthropic models.
 */
const CANONICAL_TIER_MODELS: Record<ComplexityTier, string> = {
  light: "claude-haiku-4-5",
  standard: "claude-sonnet-4-6",
  heavy: "claude-opus-4-6",
};

/**
 * Resolve a concrete model ID for a given capability tier using the
 * available model list. Provider-agnostic: picks the best available
 * model at the requested tier, falling back to the canonical Anthropic
 * ID when no available models can be inspected (e.g., at preferences
 * load time before the model registry is populated).
 *
 * @param tier              The capability tier to resolve
 * @param availableModelIds List of available model IDs, or empty if unknown
 * @param crossProvider     Whether to consider models from other providers
 */
export function resolveModelForTier(
  tier: ComplexityTier,
  availableModelIds: string[],
  crossProvider = true,
): string {
  // If no available models known, return canonical Anthropic default
  if (availableModelIds.length === 0) {
    return CANONICAL_TIER_MODELS[tier];
  }

  // Check if canonical model is available first (fast path)
  const canonical = CANONICAL_TIER_MODELS[tier];
  if (isModelAvailable(canonical, availableModelIds)) {
    return canonical;
  }

  // Find the best available model at this tier using cost-based selection
  const result = findModelForTier(
    tier,
    defaultRoutingConfig(),
    availableModelIds,
    crossProvider,
  );

  return result ?? CANONICAL_TIER_MODELS[tier];
}

// ─── Internal ────────────────────────────────────────────────────────────────

/**
 * Check whether a model ID is present in the available models list.
 * Handles bare IDs ("claude-opus-4-6") and provider-prefixed IDs ("anthropic/claude-opus-4-6").
 */
function isModelAvailable(modelId: string, availableModelIds: string[]): boolean {
  if (availableModelIds.includes(modelId)) return true;
  // Strip provider prefix for comparison
  const bare = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
  return availableModelIds.some(id => {
    const availBare = id.includes("/") ? id.split("/").pop()! : id;
    return availBare === bare;
  });
}

function getModelTier(modelId: string): ComplexityTier {
  // Strip provider prefix if present
  const bareId = modelId.includes("/") ? modelId.split("/").pop()! : modelId;

  // Check exact match first
  if (MODEL_CAPABILITY_TIER[bareId]) return MODEL_CAPABILITY_TIER[bareId];

  // Check if any known model ID is a prefix/suffix match
  for (const [knownId, tier] of Object.entries(MODEL_CAPABILITY_TIER)) {
    if (bareId.includes(knownId) || knownId.includes(bareId)) return tier;
  }

  // Unknown models are assumed heavy (safest assumption)
  return "heavy";
}

/** Check if a model ID has a known capability tier mapping. (#2192) */
function isKnownModel(modelId: string): boolean {
  const bareId = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
  if (MODEL_CAPABILITY_TIER[bareId]) return true;
  for (const knownId of Object.keys(MODEL_CAPABILITY_TIER)) {
    if (bareId.includes(knownId) || knownId.includes(bareId)) return true;
  }
  return false;
}

function findModelForTier(
  tier: ComplexityTier,
  config: DynamicRoutingConfig,
  availableModelIds: string[],
  crossProvider: boolean,
): string | null {
  // 1. Check explicit tier_models config
  const explicitModel = config.tier_models?.[tier];
  if (explicitModel && availableModelIds.includes(explicitModel)) {
    return explicitModel;
  }
  // Also check with provider prefix stripped
  if (explicitModel) {
    const match = availableModelIds.find(id => {
      const bareAvail = id.includes("/") ? id.split("/").pop()! : id;
      const bareExplicit = explicitModel.includes("/") ? explicitModel.split("/").pop()! : explicitModel;
      return bareAvail === bareExplicit;
    });
    if (match) return match;
  }

  // 2. Auto-detect: find the cheapest available model in the requested tier
  const candidates = availableModelIds
    .filter(id => {
      const modelTier = getModelTier(id);
      return modelTier === tier;
    })
    .sort((a, b) => {
      if (!crossProvider) return 0;
      const costA = getModelCost(a);
      const costB = getModelCost(b);
      return costA - costB;
    });

  return candidates[0] ?? null;
}

function getModelCost(modelId: string): number {
  const bareId = modelId.includes("/") ? modelId.split("/").pop()! : modelId;

  if (MODEL_COST_PER_1K_INPUT[bareId] !== undefined) {
    return MODEL_COST_PER_1K_INPUT[bareId];
  }

  // Check partial matches
  for (const [knownId, cost] of Object.entries(MODEL_COST_PER_1K_INPUT)) {
    if (bareId.includes(knownId) || knownId.includes(bareId)) return cost;
  }

  // Unknown cost — assume expensive to avoid routing to unknown cheap models
  return 999;
}
