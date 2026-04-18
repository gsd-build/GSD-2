/**
 * Startup model validation — extracted from cli.ts so it can be called
 * AFTER extensions register their models in the ModelRegistry.
 *
 * Before this extraction (bug #2626), the validation ran before
 * createAgentSession(), meaning extension-provided models (e.g.
 * claude-code/claude-sonnet-4-6) were not yet in the registry.
 * configuredExists was always false for extension models, causing the
 * user's valid choice to be silently overwritten with a built-in fallback.
 */

import { getPiDefaultModelAndProvider } from './pi-migration.js'

interface MinimalModel {
  provider: string
  id: string
}

interface MinimalModelRegistry {
  getAvailable(): MinimalModel[]
}

/**
 * Providers whose models are registered asynchronously (e.g. via HTTP probe
 * during session_start). If the user's configured provider is one of these
 * but the model is not yet in the registry, we skip overwriting settings —
 * the model will appear once the async probe completes.
 */
const ASYNC_DISCOVERY_PROVIDERS = new Set(['ollama'])

type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

interface MinimalSettingsManager {
  getDefaultProvider(): string | undefined
  getDefaultModel(): string | undefined
  getDefaultThinkingLevel(): ThinkingLevel | undefined
  setDefaultModelAndProvider(provider: string, modelId: string): void
  setDefaultThinkingLevel(level: ThinkingLevel): void
}

/**
 * Validate the configured default model against the registry.
 *
 * If the configured model exists in the registry, this is a no-op — the
 * user's choice is preserved.  If it does not exist (stale settings from a
 * prior install, or genuinely removed model), a fallback is selected and
 * written to settings.
 *
 * IMPORTANT: Call this AFTER createAgentSession() so that extension-
 * provided models have been registered in the ModelRegistry.
 */
export function validateConfiguredModel(
  modelRegistry: MinimalModelRegistry,
  settingsManager: MinimalSettingsManager,
): void {
  const configuredProvider = settingsManager.getDefaultProvider()
  const configuredModel = settingsManager.getDefaultModel()
  const availableModels = modelRegistry.getAvailable()
  // Check against availableModels (configured + auth'd) rather than getAll()
  // so a stale default pointing at an unconfigured provider triggers the
  // fallback. Previously a model present in the registry but missing API
  // key / OAuth would satisfy configuredExists and survive startup, ending
  // up as ctx.model even though it couldn't actually be used.
  const configuredExists = configuredProvider && configuredModel &&
    availableModels.some((m) => m.provider === configuredProvider && m.id === configuredModel)

  // Extension-provided providers (like ollama) register models asynchronously
  // on session_start. If the configured provider is one of these AND the
  // provider has NO models in the registry at all, its models may not have
  // been discovered yet. Skip overwriting settings to avoid a race condition
  // that permanently replaces the user's chosen model with a fallback
  // provider (#3531, #3534 follow-up).
  //
  // However, if the provider HAS some models available (just not the
  // specific one configured), that's a genuine "model not found" — the
  // specific model ID may be wrong/stale, and fallback should proceed.
  // Similarly, if the provider exists in getAll() but not getAvailable(),
  // the provider is registered but unauthenticated — also a genuine fallback.
  const providerHasAvailableModels = configuredProvider &&
    availableModels.some((m) => m.provider === configuredProvider)
  const isAwaitingDiscovery = configuredProvider && !configuredExists &&
    !providerHasAvailableModels &&
    ASYNC_DISCOVERY_PROVIDERS.has(configuredProvider)

  if ((!configuredModel || !configuredExists) && !isAwaitingDiscovery) {
    // Model not configured at all, or removed from registry — pick a fallback.
    // Only fires when the model is genuinely unknown (not just temporarily unavailable).
    //
    // Model-agnostic selection order:
    //   1. Pi migration default (preserves migration from ~/.pi install)
    //   2. Any model from the user's previously-chosen provider (provider stickiness)
    //   3. First available model in registry order (user-controlled via models.json)
    const piDefault = getPiDefaultModelAndProvider()
    const preferred =
      (piDefault
        ? availableModels.find((m) => m.provider === piDefault.provider && m.id === piDefault.model)
        : undefined) ||
      (configuredProvider
        ? availableModels.find((m) => m.provider === configuredProvider)
        : undefined) ||
      availableModels[0]
    if (preferred) {
      settingsManager.setDefaultModelAndProvider(preferred.provider, preferred.id)
    }
  }

  if (settingsManager.getDefaultThinkingLevel() !== 'off' && !configuredExists && !isAwaitingDiscovery) {
    settingsManager.setDefaultThinkingLevel('off')
  }
}
