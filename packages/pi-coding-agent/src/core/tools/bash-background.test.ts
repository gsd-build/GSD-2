/**
 * bash-background.test.ts — Tests for rewriteBackgroundCommand
 *
 * Regression for #733: `cmd &` causes the bash tool to hang indefinitely
 * because the background process inherits the piped stdout/stderr and keeps
 * them open. rewriteBackgroundCommand injects >/dev/null 2>&1 before & when
 * the command does not already redirect stdout.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rewriteBackgroundCommand } from "./bash.js";

describe("rewriteBackgroundCommand", () => {
	describe("no-op cases (no & operator)", () => {
		it("passes through a plain command unchanged", () => {
			const r = rewriteBackgroundCommand("python -m http.server 8080");
			assert.equal(r.rewritten, false);
			assert.equal(r.command, "python -m http.server 8080");
		});

		it("passes through a command with && (logical AND)", () => {
			const r = rewriteBackgroundCommand("npm install && npm start");
			assert.equal(r.rewritten, false);
		});

		it("passes through a command with & inside a string", () => {
			const r = rewriteBackgroundCommand("echo 'foo & bar'");
			assert.equal(r.rewritten, false);
		});
	});

	describe("rewrite cases (& backgrounding)", () => {
		it("rewrites bare background command", () => {
			const r = rewriteBackgroundCommand("python -m http.server 8080 &");
			assert.equal(r.rewritten, true);
			assert.ok(r.command.includes(">/dev/null 2>&1"), "injects stdout redirect");
			assert.ok(r.command.includes("&"), "preserves background operator");
		});

		it("rewrites background command with trailing whitespace", () => {
			const r = rewriteBackgroundCommand("python -m http.server 8080 &   ");
			assert.equal(r.rewritten, true);
			assert.ok(r.command.includes(">/dev/null 2>&1"));
		});

		it("rewrites background command with & disown", () => {
			const r = rewriteBackgroundCommand("node server.js & disown");
			assert.equal(r.rewritten, true);
			assert.ok(r.command.includes(">/dev/null 2>&1"));
		});

		it("does NOT double-inject when stdout already redirected (>)", () => {
			const r = rewriteBackgroundCommand("python -m http.server 8080 > server.log &");
			assert.equal(r.rewritten, false, "already has > redirect");
		});

		it("does NOT inject when already redirected to /dev/null", () => {
			const r = rewriteBackgroundCommand("python -m http.server 8080 >/dev/null 2>&1 &");
			assert.equal(r.rewritten, false, "already fully redirected");
		});

		it("does NOT inject when command uses a pipe", () => {
			const r = rewriteBackgroundCommand("python -m http.server 8080 | tee server.log &");
			assert.equal(r.rewritten, false, "stdout piped elsewhere");
		});
	});

	describe("compound commands", () => {
		it("rewrites only the backgrounded segment in a compound command", () => {
			const r = rewriteBackgroundCommand("echo starting; python -m http.server 8080 &");
			assert.equal(r.rewritten, true);
			assert.ok(r.command.includes(">/dev/null 2>&1 &"));
			assert.ok(r.command.includes("echo starting"), "non-background part preserved");
		});

		it("handles multiple backgrounded commands", () => {
			const r = rewriteBackgroundCommand("node server.js &\npython worker.py &");
			assert.equal(r.rewritten, true);
			const occurrences = (r.command.match(/\/dev\/null/g) ?? []).length;
			assert.ok(occurrences >= 2, "both background commands rewritten");
		});
	});

	describe("nohup / already-safe patterns pass through", () => {
		it("nohup ... & passes through unchanged (already redirects)", () => {
			const r = rewriteBackgroundCommand("nohup python -m http.server 8080 > /dev/null 2>&1 &");
			assert.equal(r.rewritten, false);
		});
	});
});
