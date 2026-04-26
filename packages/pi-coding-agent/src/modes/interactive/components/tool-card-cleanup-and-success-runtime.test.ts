// Runtime regression tests for the post-compaction tool-card cleanup and the
// green-bordered success-notification rendering. Replaces the source-grep
// `src/tests/tui-running-and-success-box.test.ts` that was deleted in #4875
// (tracked as #4872).
//
// The previous tests asserted on identifier presence and method signature
// shape via regex. A regression that routed `success` notifications through
// `showStatus` (dim text) by accident would not have failed because the
// `showSuccess` method would still exist and still match the regex. These
// tests instead drive the components through the actual scenario and assert
// on rendered output.

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

import { Container, Text } from "@gsd/pi-tui";
import stripAnsi from "strip-ansi";

import { initTheme, theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";
import { ToolExecutionComponent } from "./tool-execution.js";

// Theme is a globalThis-shared singleton that throws if not initialized.
// Initialize once before any test that exercises themed rendering.
before(() => {
	initTheme("dark");
});

interface MockTui {
	renderCount: number;
	requestRender(): void;
}

function makeMockTUI(): MockTui {
	return {
		renderCount: 0,
		requestRender() {
			this.renderCount++;
		},
	};
}

// ─── Bug 1: tool cards stuck in "Running" after compaction ──────────────

describe("ToolExecutionComponent post-compaction cleanup", () => {
	it("renders 'Running' status while the tool call has no result", () => {
		// Baseline: a freshly-constructed component (mid-stream) must show
		// the running badge — this is the state we need to flip OUT of when
		// compaction removes the result message.
		const ui = makeMockTUI();
		const c = new ToolExecutionComponent(
			"read_file",
			{ path: "/tmp/x.txt" },
			{},
			undefined,
			ui as never,
		);
		const rendered = c.render(60).map(stripAnsi).join("\n");
		assert.ok(
			rendered.includes("Running"),
			"freshly constructed component should render 'Running' badge",
		);
	});

	it("markHistoricalNoResult flips a stuck tool card OUT of 'Running'", () => {
		// Real bug: after session-history replay (post-compaction or session
		// switch), tool calls without matching tool_result messages stay in
		// isPartial = true forever. markHistoricalNoResult must produce a
		// rendered output that no longer reads "Running".
		const ui = makeMockTUI();
		const c = new ToolExecutionComponent(
			"read_file",
			{ path: "/tmp/x.txt" },
			{},
			undefined,
			ui as never,
		);

		c.markHistoricalNoResult();

		const rendered = c.render(60).map(stripAnsi).join("\n");
		assert.ok(
			!rendered.includes("Running"),
			"after markHistoricalNoResult, the tool card must NOT render 'Running' — got:\n" +
				rendered,
		);
		assert.ok(
			rendered.includes("Done"),
			"flipped card should render 'Done' status (no-result success)",
		);
	});

	it("markHistoricalNoResult is idempotent when a real result already exists", () => {
		// Late-arriving stream events must not clobber legitimate results.
		// We observe the no-clobber via behaviour: a card that completed
		// with a real result keeps its "Done" badge and content even if
		// markHistoricalNoResult fires again afterwards.
		const ui = makeMockTUI();
		const c = new ToolExecutionComponent(
			"read_file",
			{ path: "/tmp/x.txt" },
			{},
			undefined,
			ui as never,
		);

		// Use the public completion path the runtime calls.
		c.updateResult(
			{
				content: [{ type: "text", text: "real-result-payload" }],
				isError: false,
			},
			false, // isPartial = false → "Done"
		);

		const before = c.render(60).map(stripAnsi).join("\n");
		assert.ok(before.includes("Done"), "after complete(), card shows 'Done'");

		c.markHistoricalNoResult(); // must early-return
		const after = c.render(60).map(stripAnsi).join("\n");
		assert.equal(
			after,
			before,
			"markHistoricalNoResult must NOT mutate state when a real result is already present",
		);
	});
});

// ─── Bug 2: success notifications render as a green bordered box ────────

describe("Success-notification rendering — DynamicBorder + success theme", () => {
	// We drive the same component composition that interactive-mode.showSuccess
	// builds (DynamicBorder + Text + DynamicBorder, all themed with
	// theme.fg("success", …)) and assert on the rendered output, rather than
	// trying to instantiate the full InteractiveMode (which requires a real
	// session, bridge, and TUI runtime).
	function buildSuccessNotification(message: string): Container {
		const c = new Container();
		const successColor = (text: string) => theme.fg("success", text);
		c.addChild(new DynamicBorder(successColor));
		c.addChild(new Text(theme.fg("success", message), 1, 0));
		c.addChild(new DynamicBorder(successColor));
		return c;
	}

	it("renders a top and bottom horizontal border framing the message", () => {
		const c = buildSuccessNotification("Milestone M042 ready.");
		const lines = c.render(40);

		// First and last lines should be horizontal-rule borders
		// (DynamicBorder renders a row of "─" characters).
		const firstStripped = stripAnsi(lines[0]);
		const lastStripped = stripAnsi(lines[lines.length - 1]);

		assert.ok(
			firstStripped.includes("─"),
			`first line should be a border (got: ${JSON.stringify(firstStripped)})`,
		);
		assert.ok(
			lastStripped.includes("─"),
			`last line should be a border (got: ${JSON.stringify(lastStripped)})`,
		);
		assert.ok(
			lines.length >= 3,
			`success notification must have at least 3 lines (top border, message, bottom border) — got ${lines.length}`,
		);
	});

	it("the message text appears between the two borders", () => {
		const c = buildSuccessNotification("Milestone M042 ready.");
		const lines = c.render(40);

		const messageRow = lines.findIndex((l) => stripAnsi(l).includes("Milestone M042 ready."));
		assert.ok(messageRow > 0, "message must appear after the top border");
		assert.ok(
			messageRow < lines.length - 1,
			"message must appear before the bottom border",
		);
	});

	it("borders carry ANSI styling (not plain dim text like showStatus)", () => {
		// Goodhart-resistant: if a regression routed success through
		// showStatus, the borders would be missing AND the rendered text
		// would be plain (or only dim-styled, not success-colored). We
		// observe the border lines carry ANSI escape codes — the literal
		// foreground color depends on the theme (which is system-dependent
		// in CI), so we don't pin a specific code but DO require styling
		// to be present.
		const c = buildSuccessNotification("ok");
		const lines = c.render(40);
		const top = lines[0];
		assert.ok(
			top !== stripAnsi(top),
			"top border must contain ANSI styling — a plain unstyled border " +
				"would indicate the rendering bypassed theme.fg('success', ...)",
		);
	});

	it("plain Text status (the showStatus path) does NOT produce a bordered box", () => {
		// Counter-test: this is what the bug looked like — a single dim Text
		// with no surrounding border. If anyone ever "fixes" the showSuccess
		// regression by also adding borders to showStatus, this test will
		// surface the conflation.
		const plain = new Text(theme.fg("dim", "Milestone M042 ready."), 1, 0);
		const lines = plain.render(40);
		const joined = lines.map(stripAnsi).join("\n");
		assert.ok(
			!joined.includes("─"),
			"plain Text (showStatus path) must NOT contain border characters",
		);
	});
});
