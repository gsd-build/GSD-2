/**
 * worktree-health-dispatch.test.ts — Regression tests for the worktree health
 * check in auto/phases.ts (#1833, #1843).
 *
 * Verifies that the pre-dispatch health check recognises non-JS project types
 * (Rust, Go, Python, etc.) via the shared PROJECT_FILES list from detection.ts,
 * rather than hard-coding package.json / src/ only.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { PROJECT_FILES, PROJECT_FILE_EXTENSIONS } from "../detection.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a minimal git repo and return its path. */
function createGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "wt-dispatch-test-"));
  // All execSync calls use hardcoded strings only — no user input, no injection risk.
  execSync("git init", { cwd: dir, stdio: "ignore" });
  execSync("git config user.email test@test.com", { cwd: dir, stdio: "ignore" });
  execSync("git config user.name Test", { cwd: dir, stdio: "ignore" });
  writeFileSync(join(dir, "README.md"), "# test\n");
  execSync("git add . && git commit -m init", { cwd: dir, stdio: "ignore" });
  return dir;
}

/**
 * Simulate the health check logic from auto/phases.ts.
 *
 * Returns true when the directory would PASS the health check (dispatch
 * proceeds), false when it would FAIL (dispatch blocked).
 *
 * This mirrors the fixed logic: .git must exist, AND at least one
 * PROJECT_FILES entry, a src/ directory, or a file matching
 * PROJECT_FILE_EXTENSIONS must exist.
 */
function wouldPassHealthCheck(basePath: string, existsSyncFn: (p: string) => boolean): boolean {
  const hasGit = existsSyncFn(join(basePath, ".git"));
  if (!hasGit) return false;

  for (const file of PROJECT_FILES) {
    if (existsSyncFn(join(basePath, file))) return true;
  }
  if (existsSyncFn(join(basePath, "src"))) return true;

  // Extension-based detection (e.g., .sln, .csproj for C#/.NET)
  try {
    const entries = readdirSync(basePath);
    if (entries.some((e) => PROJECT_FILE_EXTENSIONS.some((ext) => e.endsWith(ext)))) return true;
  } catch { /* ignore */ }

  return false;
}

import { existsSync } from "node:fs";

// ─── Tests ───────────────────────────────────────────────────────────────────

test("PROJECT_FILES is exported and contains expected multi-ecosystem entries", () => {
  assert.ok(Array.isArray(PROJECT_FILES), "PROJECT_FILES is an array");
  assert.ok(PROJECT_FILES.length >= 19, `expected >= 19 entries, got ${PROJECT_FILES.length}`);
  // Spot-check key ecosystems
  assert.ok(PROJECT_FILES.includes("Cargo.toml"), "includes Rust marker");
  assert.ok(PROJECT_FILES.includes("go.mod"), "includes Go marker");
  assert.ok(PROJECT_FILES.includes("pyproject.toml"), "includes Python marker");
  assert.ok(PROJECT_FILES.includes("package.json"), "includes JS marker");
  assert.ok(PROJECT_FILES.includes("pom.xml"), "includes Java marker");
  assert.ok(PROJECT_FILES.includes("Package.swift"), "includes Swift marker");
});

describe("health check with git repo", () => {
  let dir: string;
  beforeEach(() => { dir = createGitRepo(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  test("health check passes for Rust project (Cargo.toml, no package.json)", () => {
    writeFileSync(join(dir, "Cargo.toml"), "[package]\nname = \"test\"\n");
    mkdirSync(join(dir, "crates"), { recursive: true });
    assert.ok(wouldPassHealthCheck(dir, existsSync), "Rust project should pass health check");
  });

  test("health check passes for Go project (go.mod, no package.json)", () => {
    writeFileSync(join(dir, "go.mod"), "module example.com/test\n\ngo 1.21\n");
    assert.ok(wouldPassHealthCheck(dir, existsSync), "Go project should pass health check");
  });

  test("health check passes for Python project (pyproject.toml, no package.json)", () => {
    writeFileSync(join(dir, "pyproject.toml"), "[project]\nname = \"test\"\n");
    assert.ok(wouldPassHealthCheck(dir, existsSync), "Python project should pass health check");
  });

  test("health check passes for Java project (pom.xml, no package.json)", () => {
    writeFileSync(join(dir, "pom.xml"), "<project></project>\n");
    assert.ok(wouldPassHealthCheck(dir, existsSync), "Java project should pass health check");
  });

  test("health check passes for Swift project (Package.swift, no package.json)", () => {
    writeFileSync(join(dir, "Package.swift"), "// swift-tools-version:5.7\n");
    assert.ok(wouldPassHealthCheck(dir, existsSync), "Swift project should pass health check");
  });

  test("health check passes for C/C++ project (CMakeLists.txt, no package.json)", () => {
    writeFileSync(join(dir, "CMakeLists.txt"), "cmake_minimum_required(VERSION 3.20)\n");
    assert.ok(wouldPassHealthCheck(dir, existsSync), "C/C++ project should pass health check");
  });

  test("health check passes for Elixir project (mix.exs, no package.json)", () => {
    writeFileSync(join(dir, "mix.exs"), "defmodule Test.MixProject do\nend\n");
    assert.ok(wouldPassHealthCheck(dir, existsSync), "Elixir project should pass health check");
  });

  test("health check passes for JS project (package.json, backward compat)", () => {
    writeFileSync(join(dir, "package.json"), '{"name":"test"}\n');
    assert.ok(wouldPassHealthCheck(dir, existsSync), "JS project should pass health check");
  });

  test("health check passes for src/-only project (backward compat)", () => {
    mkdirSync(join(dir, "src"), { recursive: true });
    assert.ok(wouldPassHealthCheck(dir, existsSync), "src/-only project should pass health check");
  });

  test("health check fails for empty git repo with no project files", () => {
    assert.ok(!wouldPassHealthCheck(dir, existsSync), "empty git repo should fail health check");
  });
});

describe("health check without git repo", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "wt-dispatch-test-nogit-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  test("health check fails for directory with no .git", () => {
    writeFileSync(join(dir, "Cargo.toml"), "[package]\nname = \"test\"\n");
    assert.ok(!wouldPassHealthCheck(dir, existsSync), "no-git directory should fail health check");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── C# / .NET ecosystem (#2106) ─────────────────────────────────────────────

test("health check passes for C# project (.sln file, no package.json)", () => {
  const dir = createGitRepo();
  try {
    writeFileSync(join(dir, "MyApp.sln"), "Microsoft Visual Studio Solution File\n");
    assert.ok(wouldPassHealthCheck(dir, existsSync), "C# solution should pass health check");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("health check passes for C# project (.csproj file, no package.json)", () => {
  const dir = createGitRepo();
  try {
    mkdirSync(join(dir, "MyApp"), { recursive: true });
    writeFileSync(join(dir, "MyApp", "MyApp.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk\">\n</Project>\n");
    // The .csproj is nested, but Directory.Build.props at root is the typical root marker.
    // This test checks that a root-level .csproj also works.
    writeFileSync(join(dir, "MyApp.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk\">\n</Project>\n");
    assert.ok(wouldPassHealthCheck(dir, existsSync), "C# .csproj project should pass health check");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("health check passes for .NET project (Directory.Build.props, no package.json)", () => {
  const dir = createGitRepo();
  try {
    writeFileSync(join(dir, "Directory.Build.props"), "<Project>\n</Project>\n");
    assert.ok(wouldPassHealthCheck(dir, existsSync), ".NET Directory.Build.props should pass health check");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PROJECT_FILES includes C#/.NET markers", () => {
  assert.ok(PROJECT_FILES.includes("Directory.Build.props"), "includes Directory.Build.props");
});

test("health check fails for empty git repo with no project files", () => {
  const dir = createGitRepo();
  try {
    assert.ok(!wouldPassHealthCheck(dir, existsSync), "empty git repo should fail health check");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
