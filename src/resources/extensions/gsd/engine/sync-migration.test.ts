// GSD-2 Single-Writer State Architecture — Sync migration tests
// Tests for migrated sync functions using snapshot/restore instead of file copy.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, closeDatabase, _getAdapter } from "../gsd-db.ts";
import type { DbAdapter } from "../gsd-db.ts";
import type { StateManifest } from "../workflow-manifest.ts";
import { writeManifest } from "../workflow-manifest.ts";
import { syncProjectRootToWorktree, syncStateToProjectRoot } from "../auto-worktree-sync.ts";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Create a minimal valid StateManifest with one milestone.
 */
function makeMinimalManifest(): StateManifest {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    milestones: [
      { id: "M001", title: "Test Milestone", status: "active", created_at: "2026-01-01T00:00:00Z", completed_at: null },
    ],
    slices: [],
    tasks: [],
    decisions: [],
    verification_evidence: [],
  };
}

/**
 * Seed a state-manifest.json file into basePath/.gsd/.
 */
function seedManifest(basePath: string, manifest?: StateManifest): void {
  const gsdDir = join(basePath, ".gsd");
  mkdirSync(gsdDir, { recursive: true });
  const data = manifest ?? makeMinimalManifest();
  writeFileSync(join(gsdDir, "state-manifest.json"), JSON.stringify(data, null, 2));
}

/**
 * Create a runtime/units/ directory with a test file.
 */
function seedRuntimeUnits(basePath: string): void {
  const unitsDir = join(basePath, ".gsd", "runtime", "units");
  mkdirSync(unitsDir, { recursive: true });
  writeFileSync(join(unitsDir, "unit-test.json"), '{"status":"running"}');
}

describe("syncProjectRootToWorktree (migrated)", () => {
  let tmpDir: string;
  let projectRoot: string;
  let worktreePath: string;
  let db: DbAdapter;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "gsd-sync-test-"));
    projectRoot = join(tmpDir, "project");
    worktreePath = join(tmpDir, "worktree");
    mkdirSync(join(projectRoot, ".gsd"), { recursive: true });
    mkdirSync(join(worktreePath, ".gsd"), { recursive: true });

    openDatabase(":memory:");
    db = _getAdapter()!;
    assert.ok(db, "DB adapter must be available");
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses restore when manifest exists — DB gets milestone from manifest", () => {
    // Seed a manifest in projectRoot with one milestone
    seedManifest(projectRoot);

    // Call sync — should read manifest from projectRoot and restore into DB
    syncProjectRootToWorktree(projectRoot, worktreePath, "M001");

    // Verify the milestone was restored into the DB
    const milestones = db.prepare("SELECT * FROM milestones").all();
    assert.equal(milestones.length, 1);
    assert.equal(milestones[0]!["id"], "M001");
    assert.equal(milestones[0]!["title"], "Test Milestone");
  });

  it("falls back to legacy when no manifest — copies milestone dir", () => {
    // No state-manifest.json — create a milestone dir in projectRoot instead
    const prMilestoneDir = join(projectRoot, ".gsd", "milestones", "M001");
    mkdirSync(prMilestoneDir, { recursive: true });
    writeFileSync(join(prMilestoneDir, "ROADMAP.md"), "# Test");

    syncProjectRootToWorktree(projectRoot, worktreePath, "M001");

    // Legacy path: milestone dir should be copied to worktree
    const wtRoadmap = join(worktreePath, ".gsd", "milestones", "M001", "ROADMAP.md");
    assert.ok(existsSync(wtRoadmap), "Legacy path should copy milestone dir");
  });

  it("copies runtime/units even in manifest path", () => {
    seedManifest(projectRoot);
    seedRuntimeUnits(projectRoot);

    syncProjectRootToWorktree(projectRoot, worktreePath, "M001");

    const wtUnit = join(worktreePath, ".gsd", "runtime", "units", "unit-test.json");
    assert.ok(existsSync(wtUnit), "Runtime units should be copied even with manifest path");
  });

  it("skips when milestoneId is null", () => {
    seedManifest(projectRoot);
    seedRuntimeUnits(projectRoot);

    // Call with null milestoneId
    syncProjectRootToWorktree(projectRoot, worktreePath, null);

    // Nothing should have been copied
    const milestones = db.prepare("SELECT * FROM milestones").all();
    assert.equal(milestones.length, 0, "Should not restore when milestoneId is null");
  });

  it("skips when paths are equal", () => {
    seedManifest(projectRoot);

    syncProjectRootToWorktree(projectRoot, projectRoot, "M001");

    // DB should be unmodified
    const milestones = db.prepare("SELECT * FROM milestones").all();
    assert.equal(milestones.length, 0, "Should not restore when paths are equal");
  });
});

describe("syncStateToProjectRoot (migrated)", () => {
  let tmpDir: string;
  let projectRoot: string;
  let worktreePath: string;
  let db: DbAdapter;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "gsd-sync-test-"));
    projectRoot = join(tmpDir, "project");
    worktreePath = join(tmpDir, "worktree");
    mkdirSync(join(projectRoot, ".gsd"), { recursive: true });
    mkdirSync(join(worktreePath, ".gsd"), { recursive: true });

    openDatabase(":memory:");
    db = _getAdapter()!;
    assert.ok(db, "DB adapter must be available");
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses writeManifest when manifest exists — writes state-manifest.json to projectRoot", () => {
    // Seed manifest in worktree (so capability check passes)
    seedManifest(worktreePath);

    // Seed DB with data so writeManifest has something to write
    db.prepare(
      `INSERT INTO milestones (id, title, status, created_at)
       VALUES ('M001', 'Test Milestone', 'active', '2026-01-01T00:00:00Z')`,
    ).run();

    syncStateToProjectRoot(worktreePath, projectRoot, "M001");

    // Verify state-manifest.json was written to projectRoot
    const prManifestPath = join(projectRoot, ".gsd", "state-manifest.json");
    assert.ok(existsSync(prManifestPath), "writeManifest should create state-manifest.json at projectRoot");

    const content = JSON.parse(readFileSync(prManifestPath, "utf-8")) as StateManifest;
    assert.equal(content.version, 1);
    assert.equal(content.milestones.length, 1);
    assert.equal(content.milestones[0]!.id, "M001");
  });

  it("falls back to legacy when no manifest — copies STATE.md and milestone dir", () => {
    // No state-manifest.json in worktree — set up legacy files
    writeFileSync(join(worktreePath, ".gsd", "STATE.md"), "# State");
    const wtMilestoneDir = join(worktreePath, ".gsd", "milestones", "M001");
    mkdirSync(wtMilestoneDir, { recursive: true });
    writeFileSync(join(wtMilestoneDir, "ROADMAP.md"), "# Roadmap");

    syncStateToProjectRoot(worktreePath, projectRoot, "M001");

    // Legacy path: STATE.md and milestone dir should be copied
    assert.ok(
      existsSync(join(projectRoot, ".gsd", "STATE.md")),
      "Legacy path should copy STATE.md",
    );
    assert.ok(
      existsSync(join(projectRoot, ".gsd", "milestones", "M001", "ROADMAP.md")),
      "Legacy path should copy milestone dir",
    );
  });

  it("copies runtime/units with force", () => {
    seedManifest(worktreePath);
    seedRuntimeUnits(worktreePath);

    // Seed DB with a milestone for writeManifest
    db.prepare(
      `INSERT INTO milestones (id, title, status, created_at)
       VALUES ('M001', 'Test Milestone', 'active', '2026-01-01T00:00:00Z')`,
    ).run();

    syncStateToProjectRoot(worktreePath, projectRoot, "M001");

    const prUnit = join(projectRoot, ".gsd", "runtime", "units", "unit-test.json");
    assert.ok(existsSync(prUnit), "Runtime units should be copied to projectRoot");
  });
});
