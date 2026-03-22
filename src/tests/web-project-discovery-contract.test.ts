import test, { after, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { discoverProjects } from "../web/project-discovery-service.ts";

// ---------------------------------------------------------------------------
// Fixture setup
// ---------------------------------------------------------------------------

const tempRoot = mkdtempSync(join(tmpdir(), "gsd-project-discovery-"));

// project-a: brownfield (package.json + .git)
const projectA = join(tempRoot, "project-a");
mkdirSync(projectA);
mkdirSync(join(projectA, ".git"));
writeFileSync(join(projectA, "package.json"), "{}");

// project-b: empty-gsd (.gsd folder, no milestones)
const projectB = join(tempRoot, "project-b");
mkdirSync(projectB);
mkdirSync(join(projectB, ".gsd"));

// project-c: brownfield (Cargo.toml)
const projectC = join(tempRoot, "project-c");
mkdirSync(projectC);
writeFileSync(join(projectC, "Cargo.toml"), "");

// project-d: blank (empty)
const projectD = join(tempRoot, "project-d");
mkdirSync(projectD);

// .hidden: should be excluded
mkdirSync(join(tempRoot, ".hidden"));

// node_modules: should be excluded
mkdirSync(join(tempRoot, "node_modules"));

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

after(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("project-discovery", () => {
  test("discovers exactly 4 project directories (excludes hidden + node_modules)", () => {
    const results = discoverProjects(tempRoot);
    assert.equal(results.length, 4, `Expected 4 projects, got ${results.length}: ${results.map(r => r.name).join(", ")}`);
  });

  test("results are sorted alphabetically by name", () => {
    const results = discoverProjects(tempRoot);
    const names = results.map(r => r.name);
    assert.deepStrictEqual(names, ["project-a", "project-b", "project-c", "project-d"]);
  });

  test("project-a is detected as brownfield with correct signals", () => {
    const results = discoverProjects(tempRoot);
    const a = results.find(r => r.name === "project-a");
    assert.ok(a, "project-a not found");
    assert.equal(a.kind, "brownfield");
    assert.equal(a.signals.hasPackageJson, true);
    assert.equal(a.signals.hasGitRepo, true);
  });

  test("project-b is detected as empty-gsd", () => {
    const results = discoverProjects(tempRoot);
    const b = results.find(r => r.name === "project-b");
    assert.ok(b, "project-b not found");
    assert.equal(b.kind, "empty-gsd");
    assert.equal(b.signals.hasGsdFolder, true);
  });

  test("project-c is detected as brownfield with hasCargo signal", () => {
    const results = discoverProjects(tempRoot);
    const c = results.find(r => r.name === "project-c");
    assert.ok(c, "project-c not found");
    assert.equal(c.kind, "brownfield");
    assert.equal(c.signals.hasCargo, true);
  });

  test("project-d is detected as blank", () => {
    const results = discoverProjects(tempRoot);
    const d = results.find(r => r.name === "project-d");
    assert.ok(d, "project-d not found");
    assert.equal(d.kind, "blank");
  });

  test("excludes .hidden and node_modules directories", () => {
    const results = discoverProjects(tempRoot);
    const names = results.map(r => r.name);
    assert.ok(!names.includes(".hidden"), ".hidden should be excluded");
    assert.ok(!names.includes("node_modules"), "node_modules should be excluded");
  });

  test("all entries have lastModified as a number > 0", () => {
    const results = discoverProjects(tempRoot);
    for (const entry of results) {
      assert.equal(typeof entry.lastModified, "number");
      assert.ok(entry.lastModified > 0, `${entry.name} lastModified should be > 0`);
    }
  });

  test("all entries have valid path and name", () => {
    const results = discoverProjects(tempRoot);
    for (const entry of results) {
      assert.ok(entry.path.startsWith(tempRoot), `${entry.name} path should start with tempRoot`);
      assert.ok(entry.name.length > 0, "name should not be empty");
    }
  });

  test("nonexistent path returns empty array", () => {
    const results = discoverProjects("/nonexistent/path/that/does/not/exist");
    assert.deepStrictEqual(results, []);
  });
});
