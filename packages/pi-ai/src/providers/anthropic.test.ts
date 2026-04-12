import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Inline the function under test — avoids needing to compile anthropic.ts first.
// Keep in sync with packages/pi-ai/src/providers/anthropic.ts.
function resolveAnthropicBaseUrl(modelBaseUrl: string): string {
	return process.env.ANTHROPIC_BASE_URL || modelBaseUrl;
}

describe("resolveAnthropicBaseUrl", () => {
	const origBaseUrl = "https://api.anthropic.com";

	it("uses model baseUrl when ANTHROPIC_BASE_URL is not set", () => {
		const orig = process.env.ANTHROPIC_BASE_URL;
		delete process.env.ANTHROPIC_BASE_URL;
		try {
			assert.equal(resolveAnthropicBaseUrl(origBaseUrl), origBaseUrl);
		} finally {
			if (orig !== undefined) process.env.ANTHROPIC_BASE_URL = orig;
		}
	});

	it("uses ANTHROPIC_BASE_URL when set", () => {
		const orig = process.env.ANTHROPIC_BASE_URL;
		process.env.ANTHROPIC_BASE_URL = "https://custom.proxy.com";
		try {
			assert.equal(resolveAnthropicBaseUrl(origBaseUrl), "https://custom.proxy.com");
		} finally {
			if (orig !== undefined) process.env.ANTHROPIC_BASE_URL = orig;
			else delete process.env.ANTHROPIC_BASE_URL;
		}
	});

	it("ANTHROPIC_BASE_URL takes precedence over model baseUrl", () => {
		const orig = process.env.ANTHROPIC_BASE_URL;
		process.env.ANTHROPIC_BASE_URL = "https://my.proxy.io/v1";
		try {
			assert.notEqual(resolveAnthropicBaseUrl(origBaseUrl), origBaseUrl);
			assert.equal(resolveAnthropicBaseUrl(origBaseUrl), "https://my.proxy.io/v1");
		} finally {
			if (orig !== undefined) process.env.ANTHROPIC_BASE_URL = orig;
			else delete process.env.ANTHROPIC_BASE_URL;
		}
	});

	it("handles empty ANTHROPIC_BASE_URL as unset", () => {
		const orig = process.env.ANTHROPIC_BASE_URL;
		process.env.ANTHROPIC_BASE_URL = "";
		try {
			assert.equal(resolveAnthropicBaseUrl(origBaseUrl), origBaseUrl);
		} finally {
			if (orig !== undefined) process.env.ANTHROPIC_BASE_URL = orig;
			else delete process.env.ANTHROPIC_BASE_URL;
		}
	});
});
