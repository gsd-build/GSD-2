// GSD Extension — Regression test for #4996: doctor orphan milestone dir check
// Verifies that checkRuntimeHealth reports orphan_milestone_dir for empty stub
// dirs with no DB row, does not report populated dirs, and does not report
// legitimate in-flight worktree-only milestone dirs.

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { checkRuntimeHealth } from "../doctor-runtime-checks.ts";
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
} from "../gsd-db.ts";
import { invalidateAllCaches } from "../cache.ts";
import type { DoctorIssue, DoctorIssueCode } from "../doctor-types.ts";

function makeBase(prefix = "gsd-doctor-orphan-"): string {
  const base = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  return base;
}

function stubDir(base: string, mid: string): void {
  mkdirSync(join(base, ".gsd", "milestones", mid, "slices"), { recursive: true });
}

function populateDir(base: string, mid: string): void {
  mkdirSync(join(base, ".gsd", "milestones", mid), { recursive: true });
  writeFileSync(join(base, ".gsd", "milestones", mid, `${mid}-CONTEXT.md`), `# ${mid}\n`);
}

describe("gsd_doctor orphan milestone directory check (#4996)", () => {
  let base: string;

  afterEach(() => {
    try { closeDatabase(); } catch { /* ignore */ }
    try { invalidateAllCaches(); } catch { /* ignore */ }
    try { rmSync(base, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("(a) empty stub dir with no DB row is reported as orphan_milestone_dir", async () => {
    base = makeBase();
    stubDir(base, "M003");

    const issues: DoctorIssue[] = [];
    const fixes: string[] = [];
    await checkRuntimeHealth(base, issues, fixes, () => false);

    const orphan = issues.find(i => i.code === "orphan_milestone_dir" && i.unitId === "M003");
    assert.ok(orphan, "should report orphan_milestone_dir for empty stub");
    assert.equal(orphan?.severity, "warning");
    assert.equal(orphan?.fixable, true);
    assert.ok(orphan?.message.includes("M003"), "message should name the milestone");
  });

  it("(b) populated milestone dir is NOT reported", async () => {
    base = makeBase();
    populateDir(base, "M001");

    const issues: DoctorIssue[] = [];
    const fixes: string[] = [];
    await checkRuntimeHealth(base, issues, fixes, () => false);

    const orphan = issues.find(i => i.code === "orphan_milestone_dir" && i.unitId === "M001");
    assert.ok(!orphan, "populated milestone dir must not be reported as orphan");
  });

  it("(c) worktree-only milestone (no content files, no DB row, but worktree exists) is NOT reported", async () => {
    base = makeBase();
    stubDir(base, "M003");
    // Simulate a legitimate in-flight worktree
    mkdirSync(join(base, ".gsd", "worktrees", "M003"), { recursive: true });

    const issues: DoctorIssue[] = [];
    const fixes: string[] = [];
    await checkRuntimeHealth(base, issues, fixes, () => false);

    const orphan = issues.find(i => i.code === "orphan_milestone_dir" && i.unitId === "M003");
    assert.ok(!orphan, "milestone with a worktree must not be reported as orphan");
  });

  it("(d) queued DB row (in-flight ID) is NOT reported as orphan", async () => {
    base = makeBase();
    stubDir(base, "M003");
    const dbPath = join(base, ".gsd", "gsd.db");
    openDatabase(dbPath);
    insertMilestone({ id: "M003", status: "queued" });

    const issues: DoctorIssue[] = [];
    const fixes: string[] = [];
    await checkRuntimeHealth(base, issues, fixes, () => false);

    const orphan = issues.find(i => i.code === "orphan_milestone_dir" && i.unitId === "M003");
    assert.ok(!orphan, "queued DB row must block orphan report (in-flight race protection)");
  });
});
