/**
 * Regression test for #1925: doctor fix patches main-project roadmap but
 * not the worktree copy, so syncStateToProjectRoot overwrites the fix on
 * the next auto-mode resume.
 *
 * When a worktree exists for a milestone, doctor must patch BOTH the
 * main-project roadmap and the worktree copy so the fix survives sync.
 */

import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, cpSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";
import { runGSDDoctor } from "../doctor.ts";

function makeTmp(name: string): string {
  const dir = join(tmpdir(), `doctor-wt-sync-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Build a minimal .gsd structure where:
 * - Milestone M005 has one slice S01, one task T01 (done with summary)
 * - Slice summary exists (so doctor will check the roadmap checkbox)
 * - Roadmap shows S01 as unchecked
 * - A worktree copy exists at .gsd/worktrees/M005/ with the same unchecked roadmap
 */
function buildScaffoldWithWorktree(base: string) {
  const gsd = join(base, ".gsd");
  const m = join(gsd, "milestones", "M005");
  const sliceDir = join(m, "slices", "S01");
  const tasksDir = join(sliceDir, "tasks");
  mkdirSync(tasksDir, { recursive: true });

  const roadmapContent = `# M005: Security Hardening

## Slices

- [ ] **S01: Security Hardening** \`risk:low\` \`depends:[]\`
  > Harden all endpoints
`;

  writeFileSync(join(m, "M005-ROADMAP.md"), roadmapContent);

  writeFileSync(join(sliceDir, "S01-PLAN.md"), `# S01: Security Hardening

**Goal:** harden endpoints

## Tasks

- [x] **T01: Add auth middleware** \`est:5m\`
`);

  writeFileSync(join(tasksDir, "T01-SUMMARY.md"), `---
id: T01
parent: S01
milestone: M005
duration: 5m
verification_result: passed
completed_at: 2026-01-01
---

# T01: Add auth middleware

Done.
`);

  // Slice summary exists so doctor will attempt the roadmap fix
  writeFileSync(join(sliceDir, "S01-SUMMARY.md"), `---
id: S01
milestone: M005
---

# S01: Security Hardening

Summary of work done.
`);

  // Create worktree copy with the SAME unchecked roadmap
  const wtBase = join(gsd, "worktrees", "M005");
  const wtM = join(wtBase, ".gsd", "milestones", "M005");
  const wtSliceDir = join(wtM, "slices", "S01");
  const wtTasksDir = join(wtSliceDir, "tasks");
  mkdirSync(wtTasksDir, { recursive: true });

  // Worktree has the same stale roadmap (unchecked)
  writeFileSync(join(wtM, "M005-ROADMAP.md"), roadmapContent);

  // Copy other files to worktree so it's a complete mirror
  cpSync(join(sliceDir, "S01-PLAN.md"), join(wtSliceDir, "S01-PLAN.md"));
  cpSync(join(sliceDir, "S01-SUMMARY.md"), join(wtSliceDir, "S01-SUMMARY.md"));
  cpSync(join(tasksDir, "T01-SUMMARY.md"), join(wtTasksDir, "T01-SUMMARY.md"));
}

test("#1925: doctor fix patches worktree roadmap copy when worktree exists", async () => {
  const tmp = makeTmp("worktree-sync");
  try {
    buildScaffoldWithWorktree(tmp);

    const mainRoadmap = join(tmp, ".gsd", "milestones", "M005", "M005-ROADMAP.md");
    const wtRoadmap = join(tmp, ".gsd", "worktrees", "M005", ".gsd", "milestones", "M005", "M005-ROADMAP.md");

    // Verify both roadmaps exist and are unchecked before fix
    assert.ok(existsSync(mainRoadmap), "main roadmap should exist");
    assert.ok(existsSync(wtRoadmap), "worktree roadmap should exist");
    assert.ok(readFileSync(mainRoadmap, "utf8").includes("- [ ] **S01:"), "main roadmap should be unchecked before fix");
    assert.ok(readFileSync(wtRoadmap, "utf8").includes("- [ ] **S01:"), "worktree roadmap should be unchecked before fix");

    // Run doctor fix
    const report = await runGSDDoctor(tmp, { fix: true });

    // Main project roadmap should be checked
    const mainContent = readFileSync(mainRoadmap, "utf8");
    assert.ok(
      mainContent.includes("- [x] **S01:"),
      "main project roadmap should mark S01 as done after doctor fix"
    );

    // Worktree roadmap copy should ALSO be checked (this is the bug fix)
    const wtContent = readFileSync(wtRoadmap, "utf8");
    assert.ok(
      wtContent.includes("- [x] **S01:"),
      "worktree roadmap copy should also mark S01 as done after doctor fix (#1925)"
    );
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
});

test("#1925: doctor fix survives simulated syncStateToProjectRoot overwrite", async () => {
  const tmp = makeTmp("sync-overwrite");
  try {
    buildScaffoldWithWorktree(tmp);

    const mainRoadmap = join(tmp, ".gsd", "milestones", "M005", "M005-ROADMAP.md");
    const wtRoadmap = join(tmp, ".gsd", "worktrees", "M005", ".gsd", "milestones", "M005", "M005-ROADMAP.md");

    // Run doctor fix
    await runGSDDoctor(tmp, { fix: true });

    // Simulate what syncStateToProjectRoot does: copy worktree -> main project
    const wtContent = readFileSync(wtRoadmap, "utf8");
    writeFileSync(mainRoadmap, wtContent);

    // After sync, main project should still show S01 as done
    // (because doctor patched BOTH copies)
    const mainAfterSync = readFileSync(mainRoadmap, "utf8");
    assert.ok(
      mainAfterSync.includes("- [x] **S01:"),
      "main roadmap should remain checked after sync because worktree copy was also patched (#1925)"
    );
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
});
