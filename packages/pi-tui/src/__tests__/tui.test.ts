import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Container, TUI } from "../tui.js";
import type { Component } from "../tui.js";
import type { Terminal } from "../terminal.js";

function makeTerminal(): Terminal {
	return {
		isTTY: true,
		columns: 80,
		rows: 24,
		kittyProtocolActive: false,
		start() {},
		stop() {},
		drainInput: async () => {},
		write() {},
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
});

describe("Container", () => {
	function makeDisposableChild(counter: { disposed: number }): Component & { dispose(): void } {
		return {
			render: () => [],
			invalidate() {},
			dispose() {
				counter.disposed++;
			},
		};
	}

	it("detachChildren() removes children without disposing them", () => {
		const c = new Container();
		const counter = { disposed: 0 };
		c.addChild(makeDisposableChild(counter));
		c.addChild(makeDisposableChild(counter));

		c.detachChildren();

		assert.equal(c.children.length, 0);
		assert.equal(counter.disposed, 0);
	});

	it("clear() still disposes children (regression guard for detach/dispose split)", () => {
		const c = new Container();
		const counter = { disposed: 0 };
		c.addChild(makeDisposableChild(counter));
		c.addChild(makeDisposableChild(counter));

		c.clear();

		assert.equal(c.children.length, 0);
		assert.equal(counter.disposed, 2);
	});
});
