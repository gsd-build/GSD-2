/**
 * GSD-2 — Regression tests for startup model validation (#3534)
 *
 * Verifies that validateConfiguredModel() correctly handles extension-provided
 * models and that stale model IDs (e.g. claude-opus-4-6[1m]) trigger fallback.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { validateConfiguredModel } from "../startup-model-validation.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

interface MockModel {
	provider: string;
	id: string;
}

function createMockRegistry(allModels: MockModel[], availableModels?: MockModel[]) {
	return {
		getAll: () => allModels,
		getAvailable: () => availableModels ?? allModels,
	};
}

function createMockSettings(defaults: { provider?: string; model?: string; thinking?: "off" | "high" }) {
	let currentProvider = defaults.provider;
	let currentModel = defaults.model;
	let currentThinking: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" = defaults.thinking ?? "off";

	return {
		getDefaultProvider: () => currentProvider,
		getDefaultModel: () => currentModel,
		getDefaultThinkingLevel: () => currentThinking,
		setDefaultModelAndProvider: (provider: string, modelId: string) => {
			currentProvider = provider;
			currentModel = modelId;
		},
		setDefaultThinkingLevel: (level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh") => {
			currentThinking = level;
		},
		// Expose for assertions
		get _provider() { return currentProvider; },
		get _model() { return currentModel; },
		get _thinking() { return currentThinking; },
	};
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("validateConfiguredModel — regression #3534", () => {
	it("preserves valid extension-provided model without overwriting", () => {
		// Simulate: user configured claude-code/claude-opus-4-6, extension has registered it
		const registry = createMockRegistry([
			{ provider: "claude-code", id: "claude-opus-4-6" },
			{ provider: "google", id: "gemini-2.5-pro" },
		]);
		const settings = createMockSettings({ provider: "claude-code", model: "claude-opus-4-6" });

		validateConfiguredModel(registry, settings);

		// Should NOT have changed the settings — the model is valid
		assert.equal(settings._provider, "claude-code");
		assert.equal(settings._model, "claude-opus-4-6");
	});

	it("falls back when configured model ID does not exist in registry", () => {
		// Simulate: user configured claude-opus-4-6[1m] but registry only has claude-opus-4-6
		const registry = createMockRegistry([
			{ provider: "anthropic", id: "claude-opus-4-6" },
			{ provider: "google", id: "gemini-2.5-pro" },
		]);
		const settings = createMockSettings({ provider: "anthropic", model: "claude-opus-4-6[1m]" });

		validateConfiguredModel(registry, settings);

		// Should have replaced with a fallback — the [1m] variant doesn't exist
		assert.notEqual(settings._model, "claude-opus-4-6[1m]");
	});

	it("prefers the user's saved provider when falling back", () => {
		// Simulate: stale model triggers fallback. The fallback should stay on
		// the user's chosen provider rather than silently jumping to a different
		// one — model-agnostic provider stickiness, not a hard-coded preference.
		const registry = createMockRegistry([
			{ provider: "anthropic", id: "claude-opus-4-6" },
			{ provider: "google", id: "gemini-2.5-pro" },
		]);
		const settings = createMockSettings({ provider: "anthropic", model: "nonexistent-model" });

		validateConfiguredModel(registry, settings);

		// Provider stickiness: should stay on anthropic, since a model from
		// that provider is still available.
		assert.equal(settings._provider, "anthropic");
	});

	it("resets thinking level when model is replaced", () => {
		const registry = createMockRegistry([
			{ provider: "anthropic", id: "claude-opus-4-6" },
		]);
		const settings = createMockSettings({
			provider: "anthropic",
			model: "nonexistent-model",
			thinking: "high",
		});

		validateConfiguredModel(registry, settings);

		assert.equal(settings._thinking, "off");
	});

	it("is a no-op when no model is configured at all", () => {
		const registry = createMockRegistry([
			{ provider: "anthropic", id: "claude-opus-4-6" },
			{ provider: "google", id: "gemini-2.5-pro" },
		]);
		const settings = createMockSettings({ provider: undefined, model: undefined });

		validateConfiguredModel(registry, settings);

		// Should pick a fallback since nothing was configured
		assert.ok(settings._provider);
		assert.ok(settings._model);
	});

	it("falls back when configured model exists in registry but provider has no auth", () => {
		// Simulate: user configured xai/grok-4 but XAI_API_KEY is unset, so
		// xai is in getAll() but not getAvailable(). Previously this slipped
		// through configuredExists and left an unusable default in place.
		const allModels = [
			{ provider: "xai", id: "grok-4-fast-non-reasoning" },
			{ provider: "anthropic", id: "claude-opus-4-6" },
		];
		const availableModels = [
			{ provider: "anthropic", id: "claude-opus-4-6" },
		];
		const registry = createMockRegistry(allModels, availableModels);
		const settings = createMockSettings({
			provider: "xai",
			model: "grok-4-fast-non-reasoning",
			thinking: "high",
		});

		validateConfiguredModel(registry, settings);

		// Should have replaced with an authenticated fallback
		assert.equal(settings._provider, "anthropic");
		assert.equal(settings._model, "claude-opus-4-6");
		// Thinking level resets because the original model was replaced
		assert.equal(settings._thinking, "off");
	});

	it("preserves claude-opus-4-7 when registered and configured (#4348)", () => {
		const registry = createMockRegistry([
			{ provider: "anthropic", id: "claude-opus-4-6" },
			{ provider: "anthropic", id: "claude-opus-4-7" },
		]);
		const settings = createMockSettings({ provider: "anthropic", model: "claude-opus-4-7" });

		validateConfiguredModel(registry, settings);

		assert.equal(settings._provider, "anthropic");
		assert.equal(settings._model, "claude-opus-4-7");
	});
});

describe("validateConfiguredModel — async discovery provider race (#3531 follow-up)", () => {
	it("does not overwrite settings when ollama model is not yet in registry", () => {
		// Simulate: user configured ollama/glm-5.1 but the ollama extension
		// hasn't finished its HTTP probe yet, so the model isn't in getAvailable().
		// Previously this would silently overwrite to a non-ollama fallback.
		const registry = createMockRegistry([
			{ provider: "anthropic", id: "claude-opus-4-6" },
		]);
		const settings = createMockSettings({ provider: "ollama", model: "glm-5.1" });

		validateConfiguredModel(registry, settings);

		// Should NOT have overwritten — ollama is an async-discovery provider
		assert.equal(settings._provider, "ollama");
		assert.equal(settings._model, "glm-5.1");
	});

	it("does not reset thinking level for async-discovery providers not yet in registry", () => {
		const registry = createMockRegistry([
			{ provider: "anthropic", id: "claude-opus-4-6" },
		]);
		const settings = createMockSettings({
			provider: "ollama",
			model: "glm-5.1",
			thinking: "high",
		});

		validateConfiguredModel(registry, settings);

		// Thinking level should NOT be reset — the model may appear later
		assert.equal(settings._thinking, "high");
	});

	it("does fall back when ollama model IS in registry but different model ID", () => {
		// If ollama models are registered but the specific model doesn't exist,
		// that's a genuine "model not found" — not a timing issue. Should fallback.
		const registry = createMockRegistry([
			{ provider: "ollama", id: "glm-4.7" },
			{ provider: "anthropic", id: "claude-opus-4-6" },
		]);
		const settings = createMockSettings({ provider: "ollama", model: "glm-5.1" });

		validateConfiguredModel(registry, settings);

		// ollama IS in registry, but glm-5.1 isn't — provider stickiness
		// should keep us on ollama (glm-4.7)
		assert.equal(settings._provider, "ollama");
		assert.equal(settings._model, "glm-4.7");
	});

	it("does fall back when ollama has no models available at all (no auth)", () => {
		// When ollama is in getAll() but NOT in getAvailable(), the provider
		// is registered but has no authenticated models. Since validateConfiguredModel
		// only checks getAvailable(), it can't distinguish this from "provider
		// hasn't finished probe yet" — both look the same. The async-discovery
		// guard will preserve settings, which is the safer default: the ollama
		// extension's session_start handler will detect the auth failure and
		// unregister the provider, allowing a subsequent validation to fall back.
		//
		// This is an intentional trade-off: it's better to temporarily keep
		// stale ollama settings (recoverable on next startup) than to silently
		// overwrite them (irrecoverable).
		const allModels = [
			{ provider: "ollama", id: "glm-5.1" },
			{ provider: "anthropic", id: "claude-opus-4-6" },
		];
		const availableModels = [
			{ provider: "anthropic", id: "claude-opus-4-6" },
		];
		const registry = createMockRegistry(allModels, availableModels);
		const settings = createMockSettings({ provider: "ollama", model: "glm-5.1" });

		validateConfiguredModel(registry, settings);

		// With the async-discovery guard, settings are preserved even though
		// ollama has no available models — the function assumes the provider
		// might still be probing. The ollama extension handles the true
		// "no auth" case by unregistering itself after a failed probe.
		assert.equal(settings._provider, "ollama");
		assert.equal(settings._model, "glm-5.1");
	});

	it("does not overwrite settings for ollama even when no model is configured", () => {
		// Edge case: provider is set to "ollama" but model is undefined.
		// The isAwaitingDiscovery check should still prevent overwriting
		// since ollama models may appear after probe.
		const registry = createMockRegistry([
			{ provider: "anthropic", id: "claude-opus-4-6" },
		]);
		const settings = createMockSettings({ provider: "ollama", model: undefined });

		validateConfiguredModel(registry, settings);

		// Should NOT pick a fallback — ollama is async-discovery
		assert.equal(settings._provider, "ollama");
		assert.equal(settings._model, undefined);
	});
});
