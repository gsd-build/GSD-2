// GSD Extension — Regression test for #4996: ghost milestone ID reuse
// Verifies that isReusableGhostMilestone correctly identifies reclaim-safe stub dirs,
// and that nextMilestoneIdReserved (guided-flow) prefers the lowest reusable ghost
// over max+1. Also covers the race-window regression: a queued DB row must NOT be reused.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { isReusableGhostMilestone } from "../state.ts";
import { nextMilestoneIdReserved } from "../milestone-id-reservation.ts";
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
} from "../gsd-db.ts";
import { clearReservedMilestoneIds, findMilestoneIds } from "../milestone-ids.ts";
import { invalidateAllCaches } from "../cache.ts";

function makeBase(prefix = "gsd-gap-4996-"): string {
  const base = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  return base;
}

function stubDir(base: string, mid: string): void {
  // Create an empty stub — the phantom pattern
  mkdirSync(join(base, ".gsd", "milestones", mid, "slices"), { recursive: true });
}

function populateDir(base: string, mid: string): void {
  mkdirSync(join(base, ".gsd", "milestones", mid), { recursive: true });
  writeFileSync(join(base, ".gsd", "milestones", mid, `${mid}-CONTEXT.md`), `# ${mid} Context\n`);
}

describe("isReusableGhostMilestone (#4996)", () => {
  let base: string;

  afterEach(() => {
    try { closeDatabase(); } catch { /* ignore */ }
    try { invalidateAllCaches(); } catch { /* ignore */ }
    try { rmSync(base, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("(a) fails closed when the DB is unavailable", () => {
    base = makeBase();
    stubDir(base, "M003");
    assert.equal(isReusableGhostMilestone(base, "M003"), false, "closed DB should block reusable-ghost claims");
  });

  it("(b) empty stub dir with an open DB and no DB row is reusable", () => {
    base = makeBase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    stubDir(base, "M003");
    assert.ok(isReusableGhostMilestone(base, "M003"), "empty stub with no DB row should be reusable");
  });

  it("(c) queued DB row with no content must NOT be reusable (race window regression)", () => {
    base = makeBase();
    stubDir(base, "M003");
    const dbPath = join(base, ".gsd", "gsd.db");
    openDatabase(dbPath);
    insertMilestone({ id: "M003", status: "queued" });
    // Even though no content files exist, the queued DB row means an in-flight discuss
    // is reserving this ID — it must not be reclaimed.
    assert.ok(!isReusableGhostMilestone(base, "M003"), "queued DB row must block reuse");
  });

  it("(d) populated milestone dir is not reusable", () => {
    base = makeBase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    populateDir(base, "M001");
    assert.ok(!isReusableGhostMilestone(base, "M001"), "populated dir must not be reusable");
  });

  it("(e) stub dir with worktree is not reusable (legitimate in-flight)", () => {
    base = makeBase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    stubDir(base, "M003");
    // Simulate an existing worktree
    mkdirSync(join(base, ".gsd", "worktrees", "M003"), { recursive: true });
    assert.ok(!isReusableGhostMilestone(base, "M003"), "dir with worktree must not be reusable");
  });

  it("(f) active DB row makes dir not reusable", () => {
    base = makeBase();
    stubDir(base, "M003");
    const dbPath = join(base, ".gsd", "gsd.db");
    openDatabase(dbPath);
    insertMilestone({ id: "M003", status: "active" });
    assert.ok(!isReusableGhostMilestone(base, "M003"), "active DB row must block reuse");
  });
});

describe("primary regression: M003/M004 stubs returned as next ID (#4996)", () => {
  let base: string;

  beforeEach(() => {
    clearReservedMilestoneIds();
  });

  afterEach(() => {
    try { closeDatabase(); } catch { /* ignore */ }
    try { invalidateAllCaches(); } catch { /* ignore */ }
    try { clearReservedMilestoneIds(); } catch { /* ignore */ }
    try { rmSync(base, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("M001/M002 populated + M003/M004 stubs → isReusableGhostMilestone returns true for M003 and M004", () => {
    base = makeBase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    populateDir(base, "M001");
    populateDir(base, "M002");
    stubDir(base, "M003");
    stubDir(base, "M004");

    assert.ok(isReusableGhostMilestone(base, "M003"), "M003 should be identified as reusable ghost");
    assert.ok(isReusableGhostMilestone(base, "M004"), "M004 should be identified as reusable ghost");
    assert.ok(!isReusableGhostMilestone(base, "M001"), "M001 should not be reusable");
    assert.ok(!isReusableGhostMilestone(base, "M002"), "M002 should not be reusable");

    const nextId = nextMilestoneIdReserved(findMilestoneIds(base), false, base);
    assert.equal(nextId, "M003", "ID reservation should select the lowest reusable ghost");
  });

  it("when all dirs are populated, no ghost exists and the function returns false for all", () => {
    base = makeBase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    populateDir(base, "M001");
    populateDir(base, "M002");

    assert.ok(!isReusableGhostMilestone(base, "M001"), "M001 is populated, not reusable");
    assert.ok(!isReusableGhostMilestone(base, "M002"), "M002 is populated, not reusable");

    const nextId = nextMilestoneIdReserved(findMilestoneIds(base), false, base);
    assert.equal(nextId, "M003", "ID reservation should fall back to max+1 when no ghost is reusable");
  });

  it("does not return an already-reserved reusable ghost twice", () => {
    base = makeBase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    stubDir(base, "M001");

    const firstId = nextMilestoneIdReserved(findMilestoneIds(base), false, base);
    const secondId = nextMilestoneIdReserved(findMilestoneIds(base), false, base);

    assert.equal(firstId, "M001", "first reservation should reuse the ghost");
    assert.equal(secondId, "M002", "second reservation must skip the already-reserved ghost");
  });
});
