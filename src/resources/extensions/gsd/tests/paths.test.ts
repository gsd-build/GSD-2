import { mkdtempSync, mkdirSync, rmSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { gsdRoot, _clearGsdRootCache } from "../paths.ts";

/** Create a tmp dir and resolve symlinks + 8.3 short names (macOS /var→/private/var, Windows RUNNER~1→runneradmin). */
function tmp(): string {
  const p = mkdtempSync(join(tmpdir(), "gsd-paths-test-"));
  try { return realpathSync.native(p); } catch { return p; }
}

function cleanup(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function initGit(dir: string): void {
  spawnSync("git", ["init"], { cwd: dir });
  spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: dir });
}

describe("gsdRoot / probeGsdRoot", () => {
  let root: string;
  const extraDirs: string[] = [];

  beforeEach(() => {
    root = tmp();
    _clearGsdRootCache();
  });

  afterEach(() => {
    cleanup(root);
    for (const d of extraDirs.splice(0)) cleanup(d);
  });

  test("fast path: .gsd exists at basePath", () => {
    mkdirSync(join(root, ".gsd"));
    assert.equal(gsdRoot(root), join(root, ".gsd"));
  });

  test("git-root probe: finds .gsd at git root from subdirectory", () => {
    initGit(root);
    mkdirSync(join(root, ".gsd"));
    const sub = join(root, "src", "deep");
    mkdirSync(sub, { recursive: true });
    assert.equal(gsdRoot(sub), join(root, ".gsd"));
  });

  test("walk-up: finds .gsd in ancestor when git root has none", () => {
    initGit(root);
    const project = join(root, "project");
    mkdirSync(join(project, ".gsd"), { recursive: true });
    const deep = join(project, "src", "deep");
    mkdirSync(deep, { recursive: true });
    assert.equal(gsdRoot(deep), join(project, ".gsd"));
  });

  test("fallback: returns basePath/.gsd when .gsd not found anywhere", () => {
    initGit(root);
    const sub = join(root, "src");
    mkdirSync(sub, { recursive: true });
    assert.equal(gsdRoot(sub), join(sub, ".gsd"));
  });

  test("cache: second call returns same value without re-probing", () => {
    mkdirSync(join(root, ".gsd"));
    const first = gsdRoot(root);
    const second = gsdRoot(root);
    assert.equal(first, second);
    assert.ok(first === second, "identity check — same string reference");
  });

  test("precedence: git-root .gsd wins over subdirectory .gsd (#2255)", () => {
    initGit(root);
    mkdirSync(join(root, ".gsd"));
    const inner = join(root, "nested");
    mkdirSync(join(inner, ".gsd"), { recursive: true });
    assert.equal(gsdRoot(inner), join(root, ".gsd"));
  });

  test("subdirectory symlink to empty dir does not shadow git-root .gsd (#2255)", () => {
    const emptyExternal = tmp();
    extraDirs.push(emptyExternal);
    initGit(root);
    mkdirSync(join(root, ".gsd", "milestones"), { recursive: true });
    const sub = join(root, "apps", "my_app", "scripts");
    mkdirSync(sub, { recursive: true });
    symlinkSync(emptyExternal, join(sub, ".gsd"), "junction");
    assert.equal(gsdRoot(sub), join(root, ".gsd"));
  });

  test("subdirectory symlink to populated dir still loses to git-root .gsd (#2255)", () => {
    const populatedExternal = tmp();
    extraDirs.push(populatedExternal);
    initGit(root);
    mkdirSync(join(root, ".gsd", "milestones", "M001"), { recursive: true });
    const sub = join(root, "packages", "app");
    mkdirSync(sub, { recursive: true });
    mkdirSync(join(populatedExternal, "milestones", "M002"), { recursive: true });
    symlinkSync(populatedExternal, join(sub, ".gsd"), "junction");
    assert.equal(gsdRoot(sub), join(root, ".gsd"));
  });
});
