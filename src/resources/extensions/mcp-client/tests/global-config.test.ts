/**
 * Regression test for #4757 — readConfigs() must also read the global
 * ~/.gsd/mcp.json (resolved as $GSD_HOME/mcp.json when GSD_HOME is set).
 *
 * Behaviour test against the exported getServerConfig — no source grep.
 * The fixture is anchored via $GSD_HOME so the test never touches the
 * developer's real ~/.gsd directory.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getServerConfig } from "../index.js";

let cwdDir: string;
let gsdHomeDir: string;
let originalCwd: string;
let originalGsdHome: string | undefined;

before(() => {
	originalCwd = process.cwd();
	originalGsdHome = process.env.GSD_HOME;

	// realpathSync resolves any symlink in tmpdir() — on macOS /var → /private/var
	// so process.cwd() after chdir matches what mkdtempSync returned.
	cwdDir = realpathSync(mkdtempSync(join(tmpdir(), "mcp-cwd-")));
	gsdHomeDir = realpathSync(mkdtempSync(join(tmpdir(), "mcp-gsdhome-")));

	// Project-local fixture (also defines `shared-server` for the precedence test)
	writeFileSync(
		join(cwdDir, ".mcp.json"),
		JSON.stringify({
			mcpServers: {
				"project-server": { command: "echo", args: ["proj"] },
				"shared-server": { command: "echo", args: ["from-project"] },
			},
		}),
		"utf-8",
	);

	// Global fixture rooted at $GSD_HOME (also defines `shared-server` to test
	// that project-local takes precedence on name collision)
	writeFileSync(
		join(gsdHomeDir, "mcp.json"),
		JSON.stringify({
			mcpServers: {
				"global-server": { command: "echo", args: ["glob"] },
				"shared-server": { command: "echo", args: ["from-global"] },
			},
		}),
		"utf-8",
	);

	process.chdir(cwdDir);
	process.env.GSD_HOME = gsdHomeDir;
});

after(() => {
	process.chdir(originalCwd);
	if (originalGsdHome === undefined) delete process.env.GSD_HOME;
	else process.env.GSD_HOME = originalGsdHome;
	try { rmSync(cwdDir, { recursive: true, force: true }); } catch { /* best-effort */ }
	try { rmSync(gsdHomeDir, { recursive: true, force: true }); } catch { /* best-effort */ }
});

test("#4757: getServerConfig resolves servers declared in $GSD_HOME/mcp.json", () => {
	const cfg = getServerConfig("global-server");
	assert.ok(cfg, "server defined in $GSD_HOME/mcp.json must resolve");
	assert.equal(cfg?.name, "global-server");
	assert.equal(cfg?.sourcePath, join(gsdHomeDir, "mcp.json"));
});

test("#4757: project-local servers still resolve when global config exists", () => {
	const cfg = getServerConfig("project-server");
	assert.ok(cfg, "project-local server must continue to resolve");
	assert.equal(cfg?.sourcePath, join(cwdDir, ".mcp.json"));
});

test("#4757: project-local config wins on server-name collision", () => {
	const cfg = getServerConfig("shared-server");
	assert.ok(cfg, "shared server must resolve");
	assert.equal(
		cfg?.sourcePath,
		join(cwdDir, ".mcp.json"),
		"project-local config must take precedence over $GSD_HOME on name collision",
	);
	assert.deepEqual(cfg?.args, ["from-project"]);
});
