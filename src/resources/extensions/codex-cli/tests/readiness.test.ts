import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
	clearReadinessCache,
	isCodexBinaryPresent,
	isCodexCliAuthed,
	isCodexCliReady,
	setCodexCommandRunnerForTests,
} from "../readiness.ts";

describe("codex-cli readiness", () => {
	test("reports ready when binary exists and login status succeeds", () => {
		setCodexCommandRunnerForTests((args) => {
			if (args[0] === "--version") return Buffer.from("codex 0.1.0");
			if (args[0] === "login" && args[1] === "status") return Buffer.from("Logged in using ChatGPT");
			throw new Error(`unexpected args: ${args.join(" ")}`);
		});

		assert.equal(isCodexBinaryPresent(), true);
		assert.equal(isCodexCliAuthed(), true);
		assert.equal(isCodexCliReady(), true);
	});

	test("reports not authenticated when login status fails", () => {
		setCodexCommandRunnerForTests((args) => {
			if (args[0] === "--version") return Buffer.from("codex 0.1.0");
			if (args[0] === "login" && args[1] === "status") {
				throw new Error("not logged in");
			}
			throw new Error(`unexpected args: ${args.join(" ")}`);
		});

		assert.equal(isCodexBinaryPresent(), true);
		assert.equal(isCodexCliAuthed(), false);
		assert.equal(isCodexCliReady(), false);
	});

	test("caches command results for the check window", () => {
		let calls = 0;
		setCodexCommandRunnerForTests((args) => {
			calls += 1;
			if (args[0] === "--version") return Buffer.from("codex 0.1.0");
			if (args[0] === "login" && args[1] === "status") return Buffer.from("Logged in using ChatGPT");
			throw new Error(`unexpected args: ${args.join(" ")}`);
		});

		assert.equal(isCodexCliReady(), true);
		assert.equal(isCodexCliReady(), true);
		assert.equal(calls, 2, "binary check and auth check should each run once while cached");
	});

	test("clearReadinessCache forces the next check to re-run commands", () => {
		let calls = 0;
		setCodexCommandRunnerForTests((args) => {
			calls += 1;
			if (args[0] === "--version") return Buffer.from("codex 0.1.0");
			if (args[0] === "login" && args[1] === "status") return Buffer.from("Logged in using ChatGPT");
			throw new Error(`unexpected args: ${args.join(" ")}`);
		});

		assert.equal(isCodexCliReady(), true);
		clearReadinessCache();
		assert.equal(isCodexCliReady(), true);
		assert.equal(calls, 4, "clearReadinessCache should invalidate both cached checks");
	});
});
