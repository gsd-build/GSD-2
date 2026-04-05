import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	isBashToolResult,
	isReadToolResult,
	isEditToolResult,
	isWriteToolResult,
	isGrepToolResult,
	isFindToolResult,
	isLsToolResult,
} from "./types.js";
import type { ToolResultEvent } from "./types.js";

function makeToolResult(toolName: string): ToolResultEvent {
	return {
		toolName,
		toolCallId: "test-id",
		result: "ok",
	} as unknown as ToolResultEvent;
}

describe("shorthand tool-result type guards", () => {
	it("isBashToolResult matches bash and rejects others", () => {
		assert.ok(isBashToolResult(makeToolResult("bash")));
		assert.ok(!isBashToolResult(makeToolResult("read")));
	});

	it("isReadToolResult matches read", () => {
		assert.ok(isReadToolResult(makeToolResult("read")));
		assert.ok(!isReadToolResult(makeToolResult("bash")));
	});

	it("isEditToolResult matches edit", () => {
		assert.ok(isEditToolResult(makeToolResult("edit")));
		assert.ok(!isEditToolResult(makeToolResult("bash")));
	});

	it("isWriteToolResult matches write", () => {
		assert.ok(isWriteToolResult(makeToolResult("write")));
		assert.ok(!isWriteToolResult(makeToolResult("bash")));
	});

	it("isGrepToolResult matches grep", () => {
		assert.ok(isGrepToolResult(makeToolResult("grep")));
		assert.ok(!isGrepToolResult(makeToolResult("bash")));
	});

	it("isFindToolResult matches find", () => {
		assert.ok(isFindToolResult(makeToolResult("find")));
		assert.ok(!isFindToolResult(makeToolResult("bash")));
	});

	it("isLsToolResult matches ls", () => {
		assert.ok(isLsToolResult(makeToolResult("ls")));
		assert.ok(!isLsToolResult(makeToolResult("bash")));
	});
});
