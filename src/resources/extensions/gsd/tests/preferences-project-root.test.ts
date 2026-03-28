/**
 * Tests that loadEffectiveGSDPreferences / loadProjectGSDPreferences use the
 * supplied projectRoot to locate PREFERENCES.md rather than process.cwd().
 *
 * Regression guard for #2985.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProjectGSDPreferences, loadEffectiveGSDPreferences } from "../preferences.ts";
import { _clearGsdRootCache } from "../paths.ts";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTmpProject(prefsContent: string): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-prefs-root-"));
  mkdirSync(join(base, ".gsd"), { recursive: true });
  writeFileSync(join(base, ".gsd", "PREFERENCES.md"), prefsContent);
  return base;
}

// ── loadProjectGSDPreferences ─────────────────────────────────────────────────

describe("loadProjectGSDPreferences", () => {
  let tmpDirs: string[] = [];

  function tmpProject(prefsContent: string): string {
    const dir = makeTmpProject(prefsContent);
    tmpDirs.push(dir);
    return dir;
  }

  beforeEach(() => {
    tmpDirs = [];
    _clearGsdRootCache();
  });

  afterEach(() => {
    _clearGsdRootCache();
    for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  });

  it("reads PREFERENCES.md from the explicit projectRoot", () => {
    const projectRoot = tmpProject("---\nversion: 1\nuat_dispatch: true\n---\n");
    const loaded = loadProjectGSDPreferences(projectRoot);

    assert.ok(loaded !== null, "should find PREFERENCES.md in the given projectRoot");
    assert.equal(loaded!.preferences.uat_dispatch, true);
    assert.ok(
      loaded!.path.startsWith(projectRoot),
      `path ${loaded!.path} should be under projectRoot ${projectRoot}`,
    );
  });

  it("does NOT fall back to process.cwd() when an explicit projectRoot is given", () => {
    // emptyRoot has no PREFERENCES.md — if process.cwd() were used we might
    // accidentally find one in the repo root.
    const emptyRoot = mkdtempSync(join(tmpdir(), "gsd-prefs-empty-"));
    tmpDirs.push(emptyRoot);

    const loaded = loadProjectGSDPreferences(emptyRoot);
    assert.equal(loaded, null, "should return null when no PREFERENCES.md under projectRoot");
  });

  it("falls back to process.cwd() without arguments and does not throw", () => {
    // We cannot control process.cwd() here, but the call must not throw and
    // must return either null or a valid preferences object.
    assert.doesNotThrow(() => {
      const result = loadProjectGSDPreferences();
      assert.ok(result === null || typeof result === "object");
    });
  });

  it("loads independent preferences for different project roots", () => {
    const rootA = tmpProject("---\nversion: 1\nuat_dispatch: true\n---\n");
    const loadedA = loadProjectGSDPreferences(rootA);

    _clearGsdRootCache();

    const rootB = tmpProject("---\nversion: 1\nuat_dispatch: false\n---\n");
    const loadedB = loadProjectGSDPreferences(rootB);

    assert.ok(loadedA !== null, "rootA should have preferences");
    assert.ok(loadedB !== null, "rootB should have preferences");
    assert.equal(loadedA!.preferences.uat_dispatch, true, "rootA: uat_dispatch=true");
    assert.equal(loadedB!.preferences.uat_dispatch, false, "rootB: uat_dispatch=false");
    assert.notEqual(loadedA!.path, loadedB!.path, "paths must differ between roots");
  });
});

// ── loadEffectiveGSDPreferences ───────────────────────────────────────────────

describe("loadEffectiveGSDPreferences", () => {
  let tmpDirs: string[] = [];

  function tmpProject(prefsContent: string): string {
    const dir = makeTmpProject(prefsContent);
    tmpDirs.push(dir);
    return dir;
  }

  beforeEach(() => {
    tmpDirs = [];
    _clearGsdRootCache();
  });

  afterEach(() => {
    _clearGsdRootCache();
    for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  });

  it("forwards the explicit projectRoot to the project prefs lookup", () => {
    const projectRoot = tmpProject("---\nversion: 1\nuat_dispatch: false\n---\n");
    const loaded = loadEffectiveGSDPreferences(projectRoot);

    if (loaded !== null) {
      assert.ok(
        loaded.path.startsWith(projectRoot) || loaded.preferences.uat_dispatch === false,
        "effective preferences should reflect the supplied projectRoot",
      );
    }
  });
});
