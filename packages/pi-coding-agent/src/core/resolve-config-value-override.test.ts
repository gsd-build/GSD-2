import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
	resolveConfigValue,
	clearConfigValueCache,
	SAFE_COMMAND_PREFIXES,
	setAllowedCommandPrefixes,
	getAllowedCommandPrefixes,
} from "./resolve-config-value.js";

describe("setAllowedCommandPrefixes — user override", () => {
	beforeEach(() => {
		clearConfigValueCache();
	});

	afterEach(() => {
		// Restore defaults after each test
		setAllowedCommandPrefixes(SAFE_COMMAND_PREFIXES);
		clearConfigValueCache();
	});

	it("overrides built-in prefixes with custom list", () => {
		setAllowedCommandPrefixes(["sops", "doppler"]);
		assert.deepEqual([...getAllowedCommandPrefixes()], ["sops", "doppler"]);
	});

	it("custom prefix is allowed through to execution", (t) => {
		const stderrChunks: string[] = [];
		const originalWrite = process.stderr.write.bind(process.stderr);
		process.stderr.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
			stderrChunks.push(chunk.toString());
			return true;
		};
		t.after(() => {
			process.stderr.write = originalWrite;
		});

		setAllowedCommandPrefixes(["mycli"]);
		resolveConfigValue("!mycli get-secret");
		const blocked = stderrChunks.some((line) => line.includes("Blocked disallowed command"));
		assert.equal(blocked, false, "mycli should not be blocked when in the custom allowlist");
	});

	it("previously-allowed prefix is blocked after override", (t) => {
		const stderrChunks: string[] = [];
		const originalWrite = process.stderr.write.bind(process.stderr);
		process.stderr.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
			stderrChunks.push(chunk.toString());
			return true;
		};
		t.after(() => {
			process.stderr.write = originalWrite;
		});

		// 'pass' is in the default list
		setAllowedCommandPrefixes(["sops"]);
		const result = resolveConfigValue("!pass show secret");
		assert.equal(result, undefined);
		const blocked = stderrChunks.some((line) => line.includes("Blocked disallowed command"));
		assert.equal(blocked, true, "pass should be blocked when not in the custom allowlist");
	});

	it("clears cache when overriding prefixes", (t) => {
		const stderrChunks: string[] = [];
		const originalWrite = process.stderr.write.bind(process.stderr);
		process.stderr.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
			stderrChunks.push(chunk.toString());
			return true;
		};
		t.after(() => {
			process.stderr.write = originalWrite;
		});

		// First: block 'mycli' under defaults
		resolveConfigValue("!mycli get-secret");
		assert.ok(stderrChunks.some((line) => line.includes("Blocked")));

		stderrChunks.length = 0;

		// Now allow it — cache should be cleared so re-evaluation happens
		setAllowedCommandPrefixes(["mycli"]);
		resolveConfigValue("!mycli get-secret");
		const blocked = stderrChunks.some((line) => line.includes("Blocked"));
		assert.equal(blocked, false, "Should re-evaluate after allowlist change");
	});
});
