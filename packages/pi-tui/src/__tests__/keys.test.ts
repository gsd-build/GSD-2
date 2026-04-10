import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { matchesKey, parseKey, setKittyProtocolActive } from "../keys.js";

const originalTmux = process.env.TMUX;

afterEach(() => {
	setKittyProtocolActive(false);
	if (originalTmux === undefined) delete process.env.TMUX;
	else process.env.TMUX = originalTmux;
});

describe("keys enter handling", () => {
	it("treats legacy CSI-u enter sequence as shift+enter when kitty protocol is inactive", () => {
		setKittyProtocolActive(false);

		assert.equal(parseKey("\x1b[13;3u"), "shift+enter");
		assert.equal(matchesKey("\x1b[13;3u", "shift+enter"), true);
		assert.equal(matchesKey("\x1b[13;3u", "alt+enter"), false);
	});

	it("keeps standard kitty CSI-u enter sequence as alt+enter when kitty protocol is active", () => {
		delete process.env.TMUX;
		setKittyProtocolActive(true);

		assert.equal(parseKey("\x1b[13;3u"), "alt+enter");
		assert.equal(matchesKey("\x1b[13;3u", "alt+enter"), true);
		assert.equal(matchesKey("\x1b[13;3u", "shift+enter"), false);
	});

	it("keeps legacy ESC+CR as alt+enter when kitty protocol is inactive", () => {
		delete process.env.TMUX;
		setKittyProtocolActive(false);

		assert.equal(parseKey("\x1b\r"), "alt+enter");
		assert.equal(matchesKey("\x1b\r", "alt+enter"), true);
		assert.equal(matchesKey("\x1b\r", "shift+enter"), false);
	});

	it("treats legacy ESC+CR as shift+enter when kitty protocol is active", () => {
		delete process.env.TMUX;
		setKittyProtocolActive(true);

		assert.equal(parseKey("\x1b\r"), "shift+enter");
		assert.equal(matchesKey("\x1b\r", "shift+enter"), true);
		assert.equal(matchesKey("\x1b\r", "alt+enter"), false);
	});

	it("treats legacy ESC+CR as shift+enter for tmux fallback mode", () => {
		process.env.TMUX = "/tmp/tmux-1000/default,123,0";
		setKittyProtocolActive(false);

		assert.equal(parseKey("\x1b\r"), "shift+enter");
		assert.equal(matchesKey("\x1b\r", "shift+enter"), true);
		assert.equal(matchesKey("\x1b\r", "alt+enter"), false);
	});
});
