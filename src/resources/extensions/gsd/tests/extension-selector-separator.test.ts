import test, { describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { initTheme } from "../../../../../packages/pi-coding-agent/src/modes/interactive/theme/theme.ts";
import { SEPARATOR_PREFIX, ExtensionSelectorComponent } from "../../../../../packages/pi-coding-agent/src/modes/interactive/components/extension-selector.ts";

// Initialize theme once before tests run (component uses theme.fg in constructor)
initTheme("default", false);

describe("SEPARATOR_PREFIX", () => {
	test("is the expected three-dash prefix", () => {
		assert.strictEqual(SEPARATOR_PREFIX, "───");
	});
});

describe("ExtensionSelectorComponent separator handling", () => {
	const options = [
		`${SEPARATOR_PREFIX} anthropic (2) ${SEPARATOR_PREFIX}`,
		"claude-opus-4-6 · anthropic",
		"claude-sonnet-4-5 · anthropic",
		`${SEPARATOR_PREFIX} openai (1) ${SEPARATOR_PREFIX}`,
		"gpt-4o · openai",
		"(keep current)",
		"(clear)",
	];

	test("initialises selectedIndex on first non-separator item", () => {
		let selected: string | undefined;
		const sel = new ExtensionSelectorComponent("Test", options, (s) => { selected = s; }, () => {});
		sel.handleInput("\n");
		assert.strictEqual(selected, "claude-opus-4-6 · anthropic");
	});

	test("skips separators when navigating down", () => {
		let selected: string | undefined;
		const sel = new ExtensionSelectorComponent("Test", options, (s) => { selected = s; }, () => {});
		sel.handleInput("\x1b[B"); // -> claude-sonnet-4-5
		sel.handleInput("\x1b[B"); // -> skip separator -> gpt-4o
		sel.handleInput("\n");
		assert.strictEqual(selected, "gpt-4o · openai");
	});

	test("skips separators when navigating up from below separator", () => {
		let selected: string | undefined;
		const sel = new ExtensionSelectorComponent("Test", options, (s) => { selected = s; }, () => {});
		sel.handleInput("\x1b[B"); // -> claude-sonnet-4-5
		sel.handleInput("\x1b[B"); // -> skip separator -> gpt-4o
		sel.handleInput("\x1b[A"); // -> skip separator -> claude-sonnet-4-5
		sel.handleInput("\n");
		assert.strictEqual(selected, "claude-sonnet-4-5 · anthropic");
	});

	test("does not fire onSelect for separator on Enter", () => {
		let selected: string | undefined;
		const opts = [
			`${SEPARATOR_PREFIX} group ${SEPARATOR_PREFIX}`,
			"item-a",
		];
		const sel = new ExtensionSelectorComponent("Test", opts, (s) => { selected = s; }, () => {});
		sel.handleInput("\n");
		assert.strictEqual(selected, "item-a");
	});

	test("works with no separators (backward compatible)", () => {
		let selected: string | undefined;
		const plain = ["alpha", "beta", "gamma"];
		const sel = new ExtensionSelectorComponent("Test", plain, (s) => { selected = s; }, () => {});
		sel.handleInput("\n");
		assert.strictEqual(selected, "alpha");

		selected = undefined;
		sel.handleInput("\x1b[B");
		sel.handleInput("\n");
		assert.strictEqual(selected, "beta");
	});
});
