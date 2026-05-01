import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { collectAutoExtensionEntries } from "./package-manager.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "package-manager-test-"));
}

function cleanDir(dir: string): void {
	fs.rmSync(dir, { recursive: true, force: true });
}

function writeFile(dir: string, name: string, content = "// stub\n"): string {
	const full = path.join(dir, name);
	fs.mkdirSync(path.dirname(full), { recursive: true });
	fs.writeFileSync(full, content);
	return full;
}

function makeBundledExt(rootDir: string, name: string): string {
	const sub = path.join(rootDir, name);
	fs.mkdirSync(sub, { recursive: true });
	const idx = path.join(sub, "index.js");
	fs.writeFileSync(idx, `// ${name} entry\n`);
	return idx;
}

// ─── collectAutoExtensionEntries ──────────────────────────────────────────────

describe("collectAutoExtensionEntries", () => {
	let extDir: string;

	beforeEach(() => {
		extDir = makeTempDir();
	});

	afterEach(() => {
		cleanDir(extDir);
	});

	it("returns an empty array when the directory does not exist", () => {
		cleanDir(extDir);
		assert.deepEqual(collectAutoExtensionEntries(extDir), []);
	});

	it("loads only the top-level index.js when no subdirs exist", () => {
		const idx = writeFile(extDir, "index.js", "// user wrapper\n");

		const result = collectAutoExtensionEntries(extDir);

		assert.deepEqual(result, [idx]);
	});

	it("loads only subdirs when no top-level index exists", () => {
		const a = makeBundledExt(extDir, "gsd");
		const b = makeBundledExt(extDir, "bg-shell");

		const result = collectAutoExtensionEntries(extDir).sort();

		assert.deepEqual(result, [a, b].sort());
	});

	it("loads top-level index.js AND bundled subdirs when both exist (regression for early-return bug)", () => {
		// Reproduces the production scenario: a user-installed extension wrapper
		// at `~/.gsd/agent/extensions/index.js` alongside bundled extension
		// subdirectories. Pre-fix, the early return on the top-level entry
		// caused every bundled extension to be silently skipped, which broke
		// slash-command dispatch (e.g. `/gsd next` falling through to the LLM).
		const userIdx = writeFile(extDir, "index.js", "// user wrapper\n");
		const gsd = makeBundledExt(extDir, "gsd");
		const bgShell = makeBundledExt(extDir, "bg-shell");
		const browserTools = makeBundledExt(extDir, "browser-tools");
		const claudeCodeCli = makeBundledExt(extDir, "claude-code-cli");

		const result = collectAutoExtensionEntries(extDir).sort();

		const expected = [userIdx, gsd, bgShell, browserTools, claudeCodeCli].sort();
		assert.deepEqual(result, expected);
	});

	it("does not double-count the top-level index.js when both branches see it", () => {
		const userIdx = writeFile(extDir, "index.js", "// user wrapper\n");
		makeBundledExt(extDir, "gsd");

		const result = collectAutoExtensionEntries(extDir);

		const occurrences = result.filter((p) => p === userIdx).length;
		assert.equal(occurrences, 1, "index.js must appear exactly once");
	});

	it("treats a pi.extensions manifest as authoritative — does not scan sibling subdirs", () => {
		// The opt-out contract from `resolveExtensionEntries`: when a package.json
		// declares `pi.extensions`, the maintainer has explicitly enumerated the
		// entries. Sibling directories must be ignored. The manifest entry is
		// returned as-resolved (directory path), matching the existing semantics.
		makeBundledExt(extDir, "declared");
		const declaredDir = path.join(extDir, "declared");
		// Sibling subdir that the manifest does NOT list — must remain unloaded.
		makeBundledExt(extDir, "not-declared");
		fs.writeFileSync(
			path.join(extDir, "package.json"),
			JSON.stringify({
				name: "user-extensions",
				type: "module",
				pi: { extensions: ["./declared"] },
			}),
		);

		const result = collectAutoExtensionEntries(extDir);

		assert.deepEqual(result, [declaredDir]);
	});

	it("falls through to subdir discovery when package.json declares an empty pi block", () => {
		// Empty `pi: {}` means "this is a library, no auto-detect on this dir".
		// `resolveExtensionEntries` returns null, and historical behavior was to
		// then enumerate subdirs — preserve that.
		const a = makeBundledExt(extDir, "gsd");
		fs.writeFileSync(
			path.join(extDir, "package.json"),
			JSON.stringify({ name: "library", type: "module", pi: {} }),
		);

		const result = collectAutoExtensionEntries(extDir);

		assert.deepEqual(result, [a]);
	});

	it("ignores hidden directories and node_modules", () => {
		makeBundledExt(extDir, ".cache");
		const nm = path.join(extDir, "node_modules", "some-pkg");
		fs.mkdirSync(nm, { recursive: true });
		fs.writeFileSync(path.join(nm, "index.js"), "// noise\n");
		const real = makeBundledExt(extDir, "real");

		const result = collectAutoExtensionEntries(extDir);

		assert.deepEqual(result, [real]);
	});
});
