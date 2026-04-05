import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "packages/pi-coding-agent/src/core/agent-session.ts"), "utf-8");

test("agent-session: explicit model switches cancel retry before applying new model", () => {
	const start = source.indexOf("private async _applyModelChange(");
	assert.ok(start >= 0, "missing _applyModelChange");
	const window = source.slice(start, start + 900);
	const abortIdx = window.indexOf("this._retryHandler.abortRetry();");
	const setModelIdx = window.indexOf("this.agent.setModel(model);");

	assert.ok(abortIdx >= 0, "_applyModelChange should cancel any in-flight retry");
	assert.ok(setModelIdx >= 0, "_applyModelChange should set the new model");
	assert.ok(
		abortIdx < setModelIdx,
		"retry cancellation must happen before applying the new model to prevent stale provider retries",
	);
});

test("agent-session: transient model switches pass persist options into thinking-level application", () => {
	const start = source.indexOf("private async _applyModelChange(");
	assert.ok(start >= 0, "missing _applyModelChange");
	const window = source.slice(start, start + 900);

	assert.ok(
		window.includes("this._applyThinkingLevel(thinkingLevel, options);"),
		"_applyModelChange should forward persist options when applying thinking level during model switches",
	);
});

test("agent-session: transient model switches do not persist thinking level defaults", () => {
	const start = source.indexOf("private _applyThinkingLevel(");
	assert.ok(start >= 0, "missing _applyThinkingLevel");
	const window = source.slice(start, start + 900);

	assert.ok(
		window.includes("options?.persist !== false && (this.supportsThinking() || effectiveLevel !== \"off\")"),
		"_applyThinkingLevel should skip settings persistence when persist:false is used for transient model switches",
	);
});
