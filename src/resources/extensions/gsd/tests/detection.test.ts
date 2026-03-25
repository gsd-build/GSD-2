/**
 * Unit tests for GSD Detection — project state and ecosystem detection.
 *
 * Exercises the pure detection functions in detection.ts:
 * - detectProjectState() with various folder layouts
 * - detectV1Planning() with real and fake .planning/ dirs
 * - detectProjectSignals() with different project types
 * - isFirstEverLaunch() / hasGlobalSetup()
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  detectProjectState,
  detectV1Planning,
  detectProjectSignals,
} from "../detection.ts";

function makeTempDir(prefix: string): string {
  const dir = join(
    tmpdir(),
    `gsd-detection-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

// ─── detectProjectState ─────────────────────────────────────────────────────────

test("detectProjectState: empty directory returns state=none", (t) => {
  const dir = makeTempDir("empty");
  t.after(() => cleanup(dir));

  const result = detectProjectState(dir);
  assert.equal(result.state, "none");
  assert.equal(result.v1, undefined);
  assert.equal(result.v2, undefined);
});

test("detectProjectState: directory with .gsd/milestones/M001 returns v2-gsd", (t) => {
  const dir = makeTempDir("v2-gsd");
  t.after(() => cleanup(dir));

  mkdirSync(join(dir, ".gsd", "milestones", "M001"), { recursive: true });
  const result = detectProjectState(dir);
  assert.equal(result.state, "v2-gsd");
  assert.ok(result.v2);
  assert.equal(result.v2!.milestoneCount, 1);
});

test("detectProjectState: directory with empty .gsd/milestones returns v2-gsd-empty", (t) => {
  const dir = makeTempDir("v2-empty");
  t.after(() => cleanup(dir));

  mkdirSync(join(dir, ".gsd", "milestones"), { recursive: true });
  const result = detectProjectState(dir);
  assert.equal(result.state, "v2-gsd-empty");
  assert.ok(result.v2);
  assert.equal(result.v2!.milestoneCount, 0);
});

test("detectProjectState: directory with .planning/ returns v1-planning", (t) => {
  const dir = makeTempDir("v1-planning");
  t.after(() => cleanup(dir));

  mkdirSync(join(dir, ".planning", "phases", "01-setup"), { recursive: true });
  writeFileSync(join(dir, ".planning", "ROADMAP.md"), "# Roadmap\n", "utf-8");
  const result = detectProjectState(dir);
  assert.equal(result.state, "v1-planning");
  assert.ok(result.v1);
  assert.equal(result.v1!.hasRoadmap, true);
  assert.equal(result.v1!.hasPhasesDir, true);
  assert.equal(result.v1!.phaseCount, 1);
});

test("detectProjectState: v2 takes priority over v1 when both exist", (t) => {
  const dir = makeTempDir("both");
  t.after(() => cleanup(dir));

  mkdirSync(join(dir, ".gsd", "milestones", "M001"), { recursive: true });
  mkdirSync(join(dir, ".planning"), { recursive: true });
  const result = detectProjectState(dir);
  assert.equal(result.state, "v2-gsd");
});

test("detectProjectState: detects preferences in .gsd/", (t) => {
  const dir = makeTempDir("prefs");
  t.after(() => cleanup(dir));

  mkdirSync(join(dir, ".gsd", "milestones"), { recursive: true });
  writeFileSync(join(dir, ".gsd", "preferences.md"), "---\nversion: 1\n---\n", "utf-8");
  const result = detectProjectState(dir);
  assert.ok(result.v2);
  assert.equal(result.v2!.hasPreferences, true);
});

// ─── detectV1Planning ───────────────────────────────────────────────────────────

test("detectV1Planning: returns null for missing .planning/", (t) => {
  const dir = makeTempDir("no-v1");
  t.after(() => cleanup(dir));

  assert.equal(detectV1Planning(dir), null);
});

test("detectV1Planning: returns null when .planning is a file", (t) => {
  const dir = makeTempDir("v1-file");
  t.after(() => cleanup(dir));

  writeFileSync(join(dir, ".planning"), "not a directory", "utf-8");
  assert.equal(detectV1Planning(dir), null);
});

test("detectV1Planning: detects phases directory with multiple phases", (t) => {
  const dir = makeTempDir("v1-phases");
  t.after(() => cleanup(dir));

  mkdirSync(join(dir, ".planning", "phases", "01-setup"), { recursive: true });
  mkdirSync(join(dir, ".planning", "phases", "02-core"), { recursive: true });
  mkdirSync(join(dir, ".planning", "phases", "03-deploy"), { recursive: true });
  const result = detectV1Planning(dir);
  assert.ok(result);
  assert.equal(result!.phaseCount, 3);
  assert.equal(result!.hasPhasesDir, true);
});

test("detectV1Planning: detects ROADMAP.md", (t) => {
  const dir = makeTempDir("v1-roadmap");
  t.after(() => cleanup(dir));

  mkdirSync(join(dir, ".planning"), { recursive: true });
  writeFileSync(join(dir, ".planning", "ROADMAP.md"), "# Roadmap", "utf-8");
  const result = detectV1Planning(dir);
  assert.ok(result);
  assert.equal(result!.hasRoadmap, true);
  assert.equal(result!.hasPhasesDir, false);
  assert.equal(result!.phaseCount, 0);
});

// ─── detectProjectSignals ───────────────────────────────────────────────────────

test("detectProjectSignals: empty directory", (t) => {
  const dir = makeTempDir("signals-empty");
  t.after(() => cleanup(dir));

  const signals = detectProjectSignals(dir);
  assert.deepEqual(signals.detectedFiles, []);
  assert.equal(signals.isGitRepo, false);
  assert.equal(signals.isMonorepo, false);
  assert.equal(signals.primaryLanguage, undefined);
  assert.equal(signals.hasCI, false);
  assert.equal(signals.hasTests, false);
  assert.deepEqual(signals.verificationCommands, []);
});

test("detectProjectSignals: Node.js project", (t) => {
  const dir = makeTempDir("signals-node");
  t.after(() => cleanup(dir));

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "test-project",
      scripts: {
        test: "jest",
        build: "tsc",
        lint: "eslint .",
      },
    }),
    "utf-8",
  );
  writeFileSync(join(dir, "package-lock.json"), "{}", "utf-8");
  mkdirSync(join(dir, ".git"), { recursive: true });

  const signals = detectProjectSignals(dir);
  assert.ok(signals.detectedFiles.includes("package.json"));
  assert.equal(signals.primaryLanguage, "javascript/typescript");
  assert.equal(signals.isGitRepo, true);
  assert.equal(signals.packageManager, "npm");
  assert.ok(signals.verificationCommands.includes("npm test"));
  assert.ok(signals.verificationCommands.some(c => c.includes("build")));
  assert.ok(signals.verificationCommands.some(c => c.includes("lint")));
});

test("detectProjectSignals: Rust project", (t) => {
  const dir = makeTempDir("signals-rust");
  t.after(() => cleanup(dir));

  writeFileSync(join(dir, "Cargo.toml"), '[package]\nname = "test"\n', "utf-8");
  const signals = detectProjectSignals(dir);
  assert.ok(signals.detectedFiles.includes("Cargo.toml"));
  assert.equal(signals.primaryLanguage, "rust");
  assert.ok(signals.verificationCommands.includes("cargo test"));
  assert.ok(signals.verificationCommands.includes("cargo clippy"));
});

test("detectProjectSignals: Go project", (t) => {
  const dir = makeTempDir("signals-go");
  t.after(() => cleanup(dir));

  writeFileSync(join(dir, "go.mod"), "module example.com/test\n", "utf-8");
  const signals = detectProjectSignals(dir);
  assert.ok(signals.detectedFiles.includes("go.mod"));
  assert.equal(signals.primaryLanguage, "go");
  assert.ok(signals.verificationCommands.includes("go test ./..."));
});

test("detectProjectSignals: Python project", (t) => {
  const dir = makeTempDir("signals-python");
  t.after(() => cleanup(dir));

  writeFileSync(join(dir, "pyproject.toml"), "[tool.poetry]\n", "utf-8");
  const signals = detectProjectSignals(dir);
  assert.ok(signals.detectedFiles.includes("pyproject.toml"));
  assert.equal(signals.primaryLanguage, "python");
  assert.ok(signals.verificationCommands.includes("pytest"));
});

test("detectProjectSignals: monorepo detection via workspaces", (t) => {
  const dir = makeTempDir("signals-monorepo");
  t.after(() => cleanup(dir));

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "mono", workspaces: ["packages/*"] }),
    "utf-8",
  );
  const signals = detectProjectSignals(dir);
  assert.equal(signals.isMonorepo, true);
});

test("detectProjectSignals: monorepo detection via turbo.json", (t) => {
  const dir = makeTempDir("signals-turbo");
  t.after(() => cleanup(dir));

  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");
  writeFileSync(join(dir, "turbo.json"), "{}", "utf-8");
  const signals = detectProjectSignals(dir);
  assert.equal(signals.isMonorepo, true);
});

test("detectProjectSignals: CI detection", (t) => {
  const dir = makeTempDir("signals-ci");
  t.after(() => cleanup(dir));

  mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
  const signals = detectProjectSignals(dir);
  assert.equal(signals.hasCI, true);
});

test("detectProjectSignals: test detection via jest config", (t) => {
  const dir = makeTempDir("signals-tests");
  t.after(() => cleanup(dir));

  writeFileSync(join(dir, "jest.config.ts"), "export default {}", "utf-8");
  const signals = detectProjectSignals(dir);
  assert.equal(signals.hasTests, true);
});

test("detectProjectSignals: package manager detection", (t) => {
  const dir1 = makeTempDir("pm-pnpm");
  const dir2 = makeTempDir("pm-yarn");
  const dir3 = makeTempDir("pm-bun");
  t.after(() => {
    cleanup(dir1);
    cleanup(dir2);
    cleanup(dir3);
  });

  writeFileSync(join(dir1, "pnpm-lock.yaml"), "", "utf-8");
  writeFileSync(join(dir1, "package.json"), "{}", "utf-8");
  assert.equal(detectProjectSignals(dir1).packageManager, "pnpm");

  writeFileSync(join(dir2, "yarn.lock"), "", "utf-8");
  writeFileSync(join(dir2, "package.json"), "{}", "utf-8");
  assert.equal(detectProjectSignals(dir2).packageManager, "yarn");

  writeFileSync(join(dir3, "bun.lockb"), "", "utf-8");
  writeFileSync(join(dir3, "package.json"), "{}", "utf-8");
  assert.equal(detectProjectSignals(dir3).packageManager, "bun");
});

test("detectProjectSignals: skips default npm test script", (t) => {
  const dir = makeTempDir("signals-default-test");
  t.after(() => cleanup(dir));

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "test",
      scripts: { test: 'echo "Error: no test specified" && exit 1' },
    }),
    "utf-8",
  );
  const signals = detectProjectSignals(dir);
  // Should NOT include the default npm test script
  assert.equal(
    signals.verificationCommands.some(c => c.includes("test")),
    false,
  );
});

test("detectProjectSignals: pnpm uses pnpm commands", (t) => {
  const dir = makeTempDir("signals-pnpm-cmds");
  t.after(() => cleanup(dir));

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "test",
      scripts: { test: "vitest", build: "tsc" },
    }),
    "utf-8",
  );
  writeFileSync(join(dir, "pnpm-lock.yaml"), "", "utf-8");
  const signals = detectProjectSignals(dir);
  assert.ok(signals.verificationCommands.includes("pnpm test"));
  assert.ok(signals.verificationCommands.includes("pnpm run build"));
});

test("detectProjectSignals: Ruby project with rspec", (t) => {
  const dir = makeTempDir("signals-ruby");
  t.after(() => cleanup(dir));

  writeFileSync(join(dir, "Gemfile"), 'source "https://rubygems.org"\n', "utf-8");
  mkdirSync(join(dir, "spec"), { recursive: true });
  const signals = detectProjectSignals(dir);
  assert.ok(signals.detectedFiles.includes("Gemfile"));
  assert.equal(signals.primaryLanguage, "ruby");
  assert.ok(signals.verificationCommands.includes("bundle exec rspec"));
});

test("detectProjectSignals: Makefile with test target", (t) => {
  const dir = makeTempDir("signals-make");
  t.after(() => cleanup(dir));

  writeFileSync(join(dir, "Makefile"), "test:\n\tgo test ./...\n\nbuild:\n\tgo build\n", "utf-8");
  const signals = detectProjectSignals(dir);
  assert.ok(signals.detectedFiles.includes("Makefile"));
  assert.ok(signals.verificationCommands.includes("make test"));
});
