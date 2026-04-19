import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveAnthropicBaseUrl } from "./anthropic.js";

describe("resolveAnthropicBaseUrl", () => {
	const DEFAULT_BASE_URL = "https://api.anthropic.com";

	it("uses model baseUrl when ANTHROPIC_BASE_URL is not set", () => {
		const orig = process.env.ANTHROPIC_BASE_URL;
		delete process.env.ANTHROPIC_BASE_URL;
		try {
			assert.equal(resolveAnthropicBaseUrl(DEFAULT_BASE_URL), DEFAULT_BASE_URL);
		} finally {
			if (orig !== undefined) {
				process.env.ANTHROPIC_BASE_URL = orig;
			}
		}
	});

	it("uses ANTHROPIC_BASE_URL when set", () => {
		const orig = process.env.ANTHROPIC_BASE_URL;
		process.env.ANTHROPIC_BASE_URL = "https://custom.proxy.com";
		try {
			assert.equal(resolveAnthropicBaseUrl(DEFAULT_BASE_URL), "https://custom.proxy.com");
		} finally {
			if (orig !== undefined) {
				process.env.ANTHROPIC_BASE_URL = orig;
			} else {
				delete process.env.ANTHROPIC_BASE_URL;
			}
		}
	});

	it("ANTHROPIC_BASE_URL takes precedence over model baseUrl", () => {
		const orig = process.env.ANTHROPIC_BASE_URL;
		process.env.ANTHROPIC_BASE_URL = "https://my.proxy.io/v1";
		try {
			assert.notEqual(resolveAnthropicBaseUrl(DEFAULT_BASE_URL), DEFAULT_BASE_URL);
			assert.equal(resolveAnthropicBaseUrl(DEFAULT_BASE_URL), "https://my.proxy.io/v1");
		} finally {
			if (orig !== undefined) {
				process.env.ANTHROPIC_BASE_URL = orig;
			} else {
				delete process.env.ANTHROPIC_BASE_URL;
			}
		}
	});

	it("handles empty ANTHROPIC_BASE_URL as unset", () => {
		const orig = process.env.ANTHROPIC_BASE_URL;
		process.env.ANTHROPIC_BASE_URL = "";
		try {
			assert.equal(resolveAnthropicBaseUrl(DEFAULT_BASE_URL), DEFAULT_BASE_URL);
		} finally {
			if (orig !== undefined) {
				process.env.ANTHROPIC_BASE_URL = orig;
			} else {
				delete process.env.ANTHROPIC_BASE_URL;
			}
		}
	});
});
