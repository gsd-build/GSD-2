import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ModelRegistry } from "./model-registry.js";
import { AuthStorage } from "./auth-storage.js";

function makeRegistry(data: Record<string, unknown> = {}) {
	const authStorage = AuthStorage.inMemory(data as any);
	// Pass undefined for modelsJsonPath to skip loading models.json from disk
	return new ModelRegistry(authStorage, undefined);
}

function getAnthropicModel(registry: ModelRegistry) {
	const model = registry.getAll().find((m) => m.provider === "anthropic");
	assert.ok(model, "built-in anthropic model must exist for this test");
	return model;
}

describe("ModelRegistry.getApiKeyAndHeaders", () => {
	it("returns ok with apiKey when auth is available", async () => {
		const registry = makeRegistry({
			anthropic: { type: "api_key", key: "sk-test-123" },
		});
		const model = getAnthropicModel(registry);
		const result = await registry.getApiKeyAndHeaders(model);
		assert.ok(result.ok, "should return ok: true");
		if (result.ok) {
			assert.equal(result.apiKey, "sk-test-123");
		}
	});

	it("returns ok:false when no auth is configured for a keyed provider", async () => {
		const registry = makeRegistry({});
		const model = getAnthropicModel(registry);
		const result = await registry.getApiKeyAndHeaders(model);
		assert.equal(result.ok, false, "should return ok: false when no key is set");
		if (!result.ok) {
			assert.match(result.error, /No API key found/, "error should mention missing key");
		}
	});

	it("returns headers from model when present", async () => {
		const registry = makeRegistry({
			anthropic: { type: "api_key", key: "sk-test" },
		});
		const model = getAnthropicModel(registry);
		const modelWithHeaders = { ...model, headers: { "X-Custom": "test-value" } };
		const result = await registry.getApiKeyAndHeaders(modelWithHeaders);
		assert.ok(result.ok);
		if (result.ok) {
			assert.deepEqual(result.headers, { "X-Custom": "test-value" });
		}
	});

	it("returns undefined headers when model has no headers", async () => {
		const registry = makeRegistry({
			anthropic: { type: "api_key", key: "sk-test" },
		});
		const model = getAnthropicModel(registry);
		const modelNoHeaders = { ...model, headers: undefined };
		const result = await registry.getApiKeyAndHeaders(modelNoHeaders);
		assert.ok(result.ok);
		if (result.ok) {
			assert.equal(result.headers, undefined);
		}
	});

	it("returns empty headers as undefined", async () => {
		const registry = makeRegistry({
			anthropic: { type: "api_key", key: "sk-test" },
		});
		const model = getAnthropicModel(registry);
		const modelEmptyHeaders = { ...model, headers: {} };
		const result = await registry.getApiKeyAndHeaders(modelEmptyHeaders);
		assert.ok(result.ok);
		if (result.ok) {
			assert.equal(result.headers, undefined, "empty headers object should normalize to undefined");
		}
	});
});
