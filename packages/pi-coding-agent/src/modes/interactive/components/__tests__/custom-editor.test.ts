import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { setKittyProtocolActive } from "@gsd/pi-tui";
import { KeybindingsManager } from "../../../../core/keybindings.js";
import { CustomEditor } from "../custom-editor.js";

afterEach(() => {
	setKittyProtocolActive(false);
});

describe("CustomEditor", () => {
	it("prioritizes newline over followUp for legacy CSI-u shift+enter", () => {
		setKittyProtocolActive(false);

		const tui = { requestRender() {} } as any;
		const theme = { borderColor: (text: string) => text, selectList: {} } as any;
		const keybindings = KeybindingsManager.create("/tmp");
		const editor = new CustomEditor(tui, theme, keybindings);
		let followUpCalls = 0;

		editor.onAction("followUp", () => {
			followUpCalls += 1;
		});

		editor.handleInput("h");
		editor.handleInput("i");
		editor.handleInput("\x1b[13;3u");
		editor.handleInput("t");

		assert.equal(editor.getText(), "hi\nt");
		assert.equal(followUpCalls, 0);
	});
});
