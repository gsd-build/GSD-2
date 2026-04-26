// @gsd/pi-coding-agent + system-prompt-cache-stability.test — regression
// coverage for #5019. The system prompt must NOT include a per-call timestamp
// by default; embedding `Date.toLocaleString()` in the cached prefix
// invalidates Anthropic prompt-cache hits on every request and incurs the
// cache-write premium. The opt-in `includeDateTime` flag preserves the prior
// behavior for callers that explicitly want clock awareness.

import test from "node:test";
import assert from "node:assert/strict";

import { buildSystemPrompt } from "../core/system-prompt.js";

// ─── Default branch (no customPrompt) ──────────────────────────────────────

test("buildSystemPrompt: default omits 'Current date and time' line", () => {
	const prompt = buildSystemPrompt({ selectedTools: ["read", "edit"] });
	assert.ok(
		!prompt.includes("Current date and time:"),
		`prompt should not include the dateTime line by default. Got:\n${prompt}`,
	);
});

test("buildSystemPrompt: includeDateTime=true emits 'Current date and time' line", () => {
	const prompt = buildSystemPrompt({
		selectedTools: ["read", "edit"],
		includeDateTime: true,
	});
	assert.match(
		prompt,
		/Current date and time: /,
		"prompt should include the dateTime line when explicitly opted in",
	);
});

test("buildSystemPrompt: includeDateTime=false explicit also omits the line", () => {
	const prompt = buildSystemPrompt({
		selectedTools: ["read", "edit"],
		includeDateTime: false,
	});
	assert.ok(!prompt.includes("Current date and time:"));
});

// ─── Custom-prompt branch ──────────────────────────────────────────────────

test("buildSystemPrompt (customPrompt): default omits 'Current date and time' line", () => {
	const prompt = buildSystemPrompt({
		customPrompt: "CUSTOM BASE",
		selectedTools: ["read"],
	});
	assert.ok(!prompt.includes("Current date and time:"));
});

test("buildSystemPrompt (customPrompt): includeDateTime=true emits the line", () => {
	const prompt = buildSystemPrompt({
		customPrompt: "CUSTOM BASE",
		selectedTools: ["read"],
		includeDateTime: true,
	});
	assert.match(prompt, /Current date and time: /);
});

// ─── Cache-stability invariant ─────────────────────────────────────────────

test("buildSystemPrompt: two back-to-back default calls produce identical prompts", async () => {
	// The bug: the previous default-on `dateTime` line included `second: "2-digit"`,
	// so two calls within the same second could match but any longer gap busted
	// the cache. Asserting equality across a deliberate sub-second sleep proves
	// the byte-for-byte stability that Anthropic prompt caching requires.
	const first = buildSystemPrompt({ selectedTools: ["read", "edit"], cwd: "/tmp/example" });
	await new Promise((resolve) => setTimeout(resolve, 1100));
	const second = buildSystemPrompt({ selectedTools: ["read", "edit"], cwd: "/tmp/example" });
	assert.equal(
		first,
		second,
		"system prompt must be byte-for-byte stable across calls so the prompt cache can hit",
	);
});

test("buildSystemPrompt: includeDateTime=true intentionally produces different prompts across the second boundary", async () => {
	// Inverse of the cache-stability test: when callers opt in, the dateTime
	// line is expected to vary. This documents the trade-off the flag exists
	// to surface.
	const first = buildSystemPrompt({
		selectedTools: ["read"],
		cwd: "/tmp/example",
		includeDateTime: true,
	});
	await new Promise((resolve) => setTimeout(resolve, 1100));
	const second = buildSystemPrompt({
		selectedTools: ["read"],
		cwd: "/tmp/example",
		includeDateTime: true,
	});
	assert.notEqual(first, second, "opt-in dateTime is expected to vary across the second boundary");
});

// ─── Cwd preservation ──────────────────────────────────────────────────────

test("buildSystemPrompt: 'Current working directory' line is preserved (only dateTime is removed)", () => {
	const prompt = buildSystemPrompt({ selectedTools: ["read"], cwd: "/tmp/example" });
	assert.match(prompt, /Current working directory: \/tmp\/example/);
});
