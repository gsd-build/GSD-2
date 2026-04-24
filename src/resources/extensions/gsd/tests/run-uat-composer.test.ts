// GSD-2 — #4782 phase 3: run-uat migrated to compose context via manifest.
// Regression test: prompt still carries the declared artifacts in the
// expected shape after the migration.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildRunUatPrompt } from "../auto-prompts.ts";
import { invalidateAllCaches } from "../cache.ts";
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  upsertMilestonePlanning,
  insertSlice,
} from "../gsd-db.ts";

function makeBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-runuat-composer-"));
  mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { closeDatabase(); } catch { /* noop */ }
  invalidateAllCaches();
  rmSync(base, { recursive: true, force: true });
}

function seed(base: string, mid: string): void {
  openDatabase(join(base, ".gsd", "gsd.db"));
  insertMilestone({ id: mid, title: "Test", status: "active", depends_on: [] });
  upsertMilestonePlanning(mid, {
    title: "Test Milestone",
    status: "active",
    vision: "Demo the composer migration",
    successCriteria: ["Prompt compiles", "UAT passes"],
    keyRisks: [],
    proofStrategy: [],
    verificationContract: "",
    verificationIntegration: "",
    verificationOperational: "",
    verificationUat: "",
    definitionOfDone: [],
    requirementCoverage: "",
    boundaryMapMarkdown: "",
  });
  insertSlice({
    id: "S01",
    milestoneId: mid,
    title: "First",
    status: "complete",
    risk: "low",
    depends: [],
    demo: "",
    sequence: 1,
  });
}

test("#4782 phase 3: buildRunUatPrompt inlines slice UAT, slice summary, project via composer", async (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));
  invalidateAllCaches();

  seed(base, "M001");

  // Write UAT + SUMMARY files for the slice
  const uatRel = ".gsd/milestones/M001/slices/S01/S01-UAT.md";
  writeFileSync(join(base, uatRel), "# S01 UAT\n\n- Check X\n- Check Y\n");
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-SUMMARY.md"),
    "---\nid: S01\nparent: M001\n---\n# S01 Summary\n**One-liner**\n\n## What Happened\nShip.\n",
  );

  const uatContent = "# S01 UAT\n\n- Check X\n- Check Y\n";
  const prompt = await buildRunUatPrompt("M001", "S01", uatRel, uatContent, base);

  // Context wrapper present
  assert.match(prompt, /## Inlined Context \(preloaded — do not re-read these files\)/);

  // Artifacts from the manifest inline list, in declared order
  assert.match(prompt, /### S01 UAT[\s\S]*### S01 Summary/);

  // UAT body content inlined
  assert.match(prompt, /Check X[\s\S]*Check Y/);

  // Summary body content inlined
  assert.match(prompt, /What Happened[\s\S]*Ship/);
});

test("#4782 phase 3: buildRunUatPrompt omits optional slice summary when file is missing", async (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));
  invalidateAllCaches();

  seed(base, "M001");

  const uatRel = ".gsd/milestones/M001/slices/S01/S01-UAT.md";
  writeFileSync(join(base, uatRel), "# S01 UAT\n");
  // No SUMMARY.md written — composer should skip the slice-summary key.

  const prompt = await buildRunUatPrompt("M001", "S01", uatRel, "# S01 UAT\n", base);

  // UAT still present
  assert.match(prompt, /### S01 UAT/);
  // No empty "S01 Summary" section — section body would be blank without a file
  assert.ok(!prompt.includes("### S01 Summary"));
  // No double separator from a skipped block
  assert.ok(!prompt.includes("---\n\n---"));
});
