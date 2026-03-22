/**
 * Regression test for #1924: Doctor's markSliceDoneInRoadmap fix is silent —
 * the roadmap gets modified on disk but fixesApplied never includes an entry,
 * making the fix invisible in doctor output.
 *
 * The root cause is that doctor.ts calls markSliceDoneInRoadmap passing
 * fixesApplied as a 4th argument, but the shared version in roadmap-mutations.ts
 * only accepts 3 parameters (basePath, mid, sid) and returns a boolean. The 4th
 * arg is silently ignored by JavaScript, and the return value is discarded.
 */

import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";
import { runGSDDoctor } from "../doctor.ts";

function makeTmp(name: string): string {
  const dir = join(tmpdir(), `doctor-fixes-applied-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Build a .gsd structure where all tasks are done, slice summary exists,
 * but roadmap checkbox is unchecked. This triggers all_tasks_done_roadmap_not_checked
 * and the fix should mark it done AND record in fixesApplied.
 */
function buildScaffold(base: string) {
  const gsd = join(base, ".gsd");
  const m = join(gsd, "milestones", "M001");
  const s = join(m, "slices", "S01");
  const t = join(s, "tasks");
  mkdirSync(t, { recursive: true });

  writeFileSync(join(m, "M001-ROADMAP.md"), `# M001: Test

## Slices

- [ ] **S01: Test Slice** \`risk:low\` \`depends:[]\`
  > Demo text
`);

  writeFileSync(join(s, "S01-PLAN.md"), `# S01: Test Slice

**Goal:** test

## Tasks

- [x] **T01: Do stuff** \`est:5m\`
`);

  writeFileSync(join(t, "T01-SUMMARY.md"), `---
id: T01
parent: S01
milestone: M001
duration: 5m
verification_result: passed
completed_at: 2026-01-01
---

# T01: Do stuff

Done.
`);

  // Pre-create slice summary so the roadmap fix is allowed to fire
  writeFileSync(join(s, "S01-SUMMARY.md"), `---
id: S01
milestone: M001
---

# S01: Test Slice

Summary content.
`);
}

test("fixesApplied includes roadmap checkbox entry when markSliceDoneInRoadmap fires (#1924)", async () => {
  const tmp = makeTmp("fixes-applied");
  try {
    buildScaffold(tmp);

    const report = await runGSDDoctor(tmp, { fix: true });

    // The roadmap should be modified on disk
    const roadmapContent = readFileSync(join(tmp, ".gsd", "milestones", "M001", "M001-ROADMAP.md"), "utf8");
    assert.ok(roadmapContent.includes("- [x] **S01"), "roadmap checkbox should be checked");

    // CRITICAL: fixesApplied must include an entry about the roadmap fix.
    // Before #1924, the return value from markSliceDoneInRoadmap was discarded
    // and fixesApplied was never updated, making the fix invisible.
    assert.ok(
      report.fixesApplied.some((f: string) => f.includes("S01") && f.includes("roadmap")),
      `fixesApplied should mention roadmap fix for S01, got: [${report.fixesApplied.join("; ")}]`
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
