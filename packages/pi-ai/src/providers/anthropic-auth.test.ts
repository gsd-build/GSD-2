import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { usesAnthropicBearerAuth } from "./anthropic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("usesAnthropicBearerAuth covers Bearer-only Anthropic-compatible providers (#3783)", () => {
	assert.equal(usesAnthropicBearerAuth("alibaba-coding-plan"), true);
	assert.equal(usesAnthropicBearerAuth("minimax"), true);
	assert.equal(usesAnthropicBearerAuth("minimax-cn"), true);
	assert.equal(usesAnthropicBearerAuth("anthropic"), false);
});

test("createClient routes Bearer-auth providers through authToken (#3783)", () => {
	const source = readFileSync(join(__dirname, "..", "..", "src", "providers", "anthropic.ts"), "utf-8");
	assert.ok(
		source.includes("const usesBearerAuth = usesAnthropicBearerAuth(model.provider);"),
		"createClient should derive auth mode from usesAnthropicBearerAuth",
	);
	assert.ok(
		source.includes("apiKey: usesBearerAuth ? null : apiKey"),
		"Bearer-auth providers should skip x-api-key auth",
	);
	assert.ok(
		source.includes("authToken: usesBearerAuth ? apiKey : undefined"),
		"Bearer-auth providers should send authToken instead",
	);
});
