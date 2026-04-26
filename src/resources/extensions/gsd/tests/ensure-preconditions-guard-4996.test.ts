// GSD Extension — Regression test for #4996: ensurePreconditions phantom dir guard
// Verifies that ensurePreconditions does not create milestone directories for
// forward-referenced slice unit IDs when the milestone has no DB row.

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { ensurePreconditions } from "../auto.ts";
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
} from "../gsd-db.ts";

import type { GSDState } from "../types.ts";

function makeBase(prefix = "gsd-precond-"): string {
  const base = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  return base;
}

function makeMinimalState(): GSDState {
  return {
    activeMilestone: null,
    activeSlice: null,
    activeTask: null,
    phase: "planning",
    recentDecisions: [],
    blockers: [],
    nextAction: "",
    registry: [],
  };
}

describe("ensurePreconditions phantom-dir guard (#4996)", () => {
  let base: string;

  afterEach(() => {
    try { closeDatabase(); } catch { /* ignore */ }
    try { rmSync(base, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("(a) slice unit ID for unknown milestone does NOT create dirs when no DB row exists", () => {
    base = makeBase();
    const state = makeMinimalState();

    ensurePreconditions("execute-task", "M003/S01", base, state);

    const milestoneDir = join(base, ".gsd", "milestones", "M003");
    assert.ok(!existsSync(milestoneDir), "M003 dir must not be created for phantom slice dispatch");
  });

  it("(b) slice unit ID for milestone with DB row DOES create dirs", () => {
    base = makeBase();
    const dbPath = join(base, ".gsd", "gsd.db");
    openDatabase(dbPath);
    insertMilestone({ id: "M003", status: "active" });
    const state = makeMinimalState();

    ensurePreconditions("execute-task", "M003/S01", base, state);

    const milestoneDir = join(base, ".gsd", "milestones", "M003");
    assert.ok(existsSync(milestoneDir), "M003 dir must be created when DB row exists");
  });

  it("(c) slice unit ID for existing milestone dir with CONTEXT.md content file uses normal scaffolding", () => {
    base = makeBase();
    const mid = "M003";
    const milestoneDir = join(base, ".gsd", "milestones", mid);
    mkdirSync(milestoneDir, { recursive: true });
    writeFileSync(join(milestoneDir, `${mid}-CONTEXT.md`), "# Context\n");
    const state = makeMinimalState();

    ensurePreconditions("execute-task", "M003/S01", base, state);

    const slicesDir = join(milestoneDir, "slices");
    assert.ok(existsSync(slicesDir), "existing milestone dir should allow slice scaffolding");
  });

  it("(d) milestone-only unit ID (no slice) still creates dir even with no DB row", () => {
    base = makeBase();
    const state = makeMinimalState();

    ensurePreconditions("discuss-milestone", "M003", base, state);

    const milestoneDir = join(base, ".gsd", "milestones", "M003");
    assert.ok(existsSync(milestoneDir), "M003 dir must be created for milestone-only dispatch");
  });
});
