import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CURSOR_MARKER, TUI, type Component } from "../tui.js";
import type { Terminal } from "../terminal.js";

function makeTerminal(): Terminal & { writes: string[] } {
	const writes: string[] = [];
	return {
		writes,
		isTTY: true,
		columns: 80,
		rows: 24,
		kittyProtocolActive: false,
		start() {},
		stop() {},
		drainInput: async () => {},
		write(data: string) {
			writes.push(data);
		},
		moveBy() {},
		hideCursor() {},
		showCursor() {},
		clearLine() {},
		clearFromCursor() {},
		clearScreen() {},
		setTitle() {},
	};
}

describe("TUI", () => {
	it("does not swallow a bare Escape keypress while waiting for the cell-size response", () => {
		const tui = new TUI(makeTerminal());
		const received: string[] = [];

		tui.setFocus({
			render: () => [],
			handleInput: (data: string) => {
				received.push(data);
			},
			invalidate() {},
		});

		const anyTui = tui as any;
		anyTui.cellSizeQueryPending = true;
		anyTui.inputBuffer = "";

		anyTui.handleInput("\x1b");

		assert.deepEqual(received, ["\x1b"]);
		assert.equal(anyTui.cellSizeQueryPending, false);
		assert.equal(anyTui.inputBuffer, "");
	});

	it("uses the content-bottom row, not the IME row, when clearing removed lines", () => {
		const terminal = makeTerminal();
		const tui = new TUI(terminal);

		let lines = [
			"title",
			`input ${CURSOR_MARKER}`,
			"results",
			"footer",
			"autocomplete a",
			"autocomplete b",
		];

		const component: Component = {
			render: () => [...lines],
			invalidate() {},
		};

		tui.addChild(component);

		const anyTui = tui as any;
		anyTui.doRender();

		terminal.writes.length = 0;
		lines = [
			"title",
			`input ${CURSOR_MARKER}`,
			"results",
			"footer",
		];

		anyTui.doRender();

		assert.equal(anyTui.contentCursorRow, 3, "content cursor should track the bottom of rendered content");
		assert.equal(anyTui.hardwareCursorRow, 1, "hardware cursor should still follow the IME row");
		assert.ok(
			terminal.writes.some((write) => write.includes("\x1b[2A")),
			"shrink render should move up from the previous content bottom before clearing deleted lines",
		);
		assert.ok(
			terminal.writes.every((write) => !write.includes("\x1b[2B")),
			"shrink render must not move down from the IME row baseline when clearing deleted lines",
		);
	});
});
