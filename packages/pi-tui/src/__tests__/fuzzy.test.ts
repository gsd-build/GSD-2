import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fuzzyMatch, fuzzyFilter } from "../fuzzy.js";

describe("fuzzyMatch", () => {
	it("matches exact string", () => {
		const result = fuzzyMatch("hello", "hello");
		assert.equal(result.matches, true);
	});

	it("matches substring characters in order", () => {
		const result = fuzzyMatch("hlo", "hello");
		assert.equal(result.matches, true);
	});

	it("does not match when characters are out of order", () => {
		const result = fuzzyMatch("olh", "hello");
		assert.equal(result.matches, false);
	});

	it("empty query matches everything", () => {
		const result = fuzzyMatch("", "anything");
		assert.equal(result.matches, true);
		assert.equal(result.score, 0);
	});

	it("does not match when query is longer than text", () => {
		const result = fuzzyMatch("toolong", "short");
		assert.equal(result.matches, false);
	});

	it("is case insensitive", () => {
		const result = fuzzyMatch("ABC", "abcdef");
		assert.equal(result.matches, true);
	});

	it("rewards consecutive matches with lower score", () => {
		const consecutive = fuzzyMatch("hel", "hello");
		const gapped = fuzzyMatch("hlo", "hello");
		assert.ok(consecutive.score < gapped.score, "consecutive matches should score lower (better)");
	});

	it("rewards word boundary matches", () => {
		const boundary = fuzzyMatch("sc", "slash-command");
		const nonBoundary = fuzzyMatch("sc", "describe");
		assert.ok(boundary.score < nonBoundary.score, "word boundary matches should score lower (better)");
	});

	it("handles alphanumeric swap (e.g., opus3 matches opus-3)", () => {
		const result = fuzzyMatch("opus3", "opus-3");
		assert.equal(result.matches, true);
	});

	it("handles numeric-alpha swap", () => {
		const result = fuzzyMatch("3opus", "opus-3");
		assert.equal(result.matches, true);
	});

	it("does not match completely unrelated strings", () => {
		const result = fuzzyMatch("xyz", "hello");
		assert.equal(result.matches, false);
	});
});

describe("fuzzyFilter", () => {
	const items = ["settings", "session", "share", "model", "compact", "export"];

	it("returns all items for empty query", () => {
		const result = fuzzyFilter(items, "", (x) => x);
		assert.equal(result.length, items.length);
	});

	it("filters to matching items only", () => {
		const result = fuzzyFilter(items, "se", (x) => x);
		assert.ok(result.includes("settings"));
		assert.ok(result.includes("session"));
		assert.ok(!result.includes("model"));
	});

	it("sorts by match quality (best first)", () => {
		const result = fuzzyFilter(items, "ex", (x) => x);
		assert.equal(result[0], "export");
	});

	it("supports space-separated tokens (all must match)", () => {
		const data = ["anthropic/opus", "anthropic/sonnet", "openai/gpt4"];
		const result = fuzzyFilter(data, "ant opus", (x) => x);
		assert.equal(result.length, 1);
		assert.equal(result[0], "anthropic/opus");
	});

	it("returns empty array when no items match", () => {
		const result = fuzzyFilter(items, "zzz", (x) => x);
		assert.equal(result.length, 0);
	});

	it("works with custom getText function", () => {
		const objects = [
			{ name: "alpha", id: 1 },
			{ name: "beta", id: 2 },
			{ name: "gamma", id: 3 },
		];
		const result = fuzzyFilter(objects, "bet", (o) => o.name);
		assert.equal(result.length, 1);
		assert.equal(result[0]?.name, "beta");
	});

	it("handles whitespace-only query as empty", () => {
		const result = fuzzyFilter(items, "   ", (x) => x);
		assert.equal(result.length, items.length);
	});
});
