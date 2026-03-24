import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Api, Model } from "@gsd/pi-ai";
import type { AuthStorage } from "./auth-storage.js";
import { ModelRegistry } from "./model-registry.js";

function createRegistry(hasAuthFn?: (provider: string) => boolean): ModelRegistry {
	const authStorage = {
		setFallbackResolver: () => {},
		onCredentialChange: () => {},
		getOAuthProviders: () => [],
		get: () => undefined,
		hasAuth: hasAuthFn ?? (() => false),
		getApiKey: async () => undefined,
	} as unknown as AuthStorage;

	return new ModelRegistry(authStorage, undefined);
}

function createProviderModel(id: string): NonNullable<Parameters<ModelRegistry["registerProvider"]>[1]["models"]>[number] {
	return {
		id,
		name: id,
		api: "openai-completions",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16384,
	};
}

function findModel(registry: ModelRegistry, provider: string, id: string): Model<Api> | undefined {
	return registry.getAvailable().find((m) => m.provider === provider && m.id === id);
}

describe("ModelRegistry authMode support", () => {
	it("registers externalCli provider models without apiKey/oauth", () => {
		const registry = createRegistry();

		assert.doesNotThrow(() => {
			registry.registerProvider("ext-cli-provider", {
				authMode: "externalCli",
				baseUrl: "https://cli.local",
				api: "openai-completions",
				models: [createProviderModel("cli-model")],
			});
		});
	});

	it("includes externalCli provider models in available list without stored auth", () => {
		const registry = createRegistry(() => false);

		registry.registerProvider("ext-cli-provider", {
			authMode: "externalCli",
			baseUrl: "https://cli.local",
			api: "openai-completions",
			models: [createProviderModel("cli-model")],
		});

		assert.ok(findModel(registry, "ext-cli-provider", "cli-model"));
	});

	it("keeps apiKey providers gated when no auth is present", () => {
		const registry = createRegistry(() => false);

		assert.throws(() => {
			registry.registerProvider("ext-apikey-provider", {
				authMode: "apiKey",
				baseUrl: "https://api.local",
				api: "openai-completions",
				models: [createProviderModel("apikey-model")],
			});
		});
	});
});
