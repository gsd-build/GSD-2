// GSD-2 — #4782 phase 3 batch 3: complete-slice migrated through composer.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildCompleteSlicePrompt } from "../auto-prompts.ts";
import { invalidateAllCaches } from "../cache.ts";
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  upsertMilestonePlanning,
  insertSlice,
  insertTask,
} from "../gsd-db.ts";

function makeBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-completeslice-composer-"));
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
  insertMilestone({ id: mid, title: "Composer Test", status: "active", depends_on: [] });
  upsertMilestonePlanning(mid, {
    title: "Composer Test",
    status: "active",
    vision: "Validate complete-slice migration",
    successCriteria: ["Prompt compiles"],
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
  insertTask({
    id: "T01",
    sliceId: "S01",
    milestoneId: mid,
    title: "Task one",
    status: "complete",
  });
}

function writeArtifacts(base: string): void {
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
    "# M001 Roadmap\n## Slices\n- [x] **S01: First** `risk:low` `depends:[]`\n",
  );
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-PLAN.md"),
    "# S01 Plan\n\nSlice plan body.\n",
  );
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks", "T01-SUMMARY.md"),
    "---\nid: T01\n---\n# T01 Summary\n\nTask one did the thing.\n",
  );
}

test("#4782 phase 3: buildCompleteSlicePrompt composes roadmap → plan → task summaries → templates in declared order", async (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));
  invalidateAllCaches();

  seed(base, "M001");
  writeArtifacts(base);

  const prompt = await buildCompleteSlicePrompt("M001", "Composer Test", "S01", "First", base);

  // Context wrapper present
  assert.match(prompt, /## Inlined Context \(preloaded — do not re-read these files\)/);

  // Manifest-declared artifacts present
  assert.match(prompt, /### Milestone Roadmap/);
  assert.match(prompt, /### Slice Plan/);
  assert.match(prompt, /### Task Summary: T01/);
  assert.match(prompt, /### Output Template: Slice Summary/);

  // Ordering: roadmap → slice plan → task summaries → slice summary template
  const roadmapIdx = prompt.indexOf("### Milestone Roadmap");
  const planIdx = prompt.indexOf("### Slice Plan");
  const taskSummaryIdx = prompt.indexOf("### Task Summary: T01");
  const sliceSummaryTemplateIdx = prompt.indexOf("### Output Template: Slice Summary");

  assert.ok(roadmapIdx > -1 && planIdx > roadmapIdx, "roadmap precedes slice plan");
  assert.ok(planIdx > -1 && taskSummaryIdx > planIdx, "slice plan precedes task summaries");
  assert.ok(
    taskSummaryIdx > -1 && sliceSummaryTemplateIdx > taskSummaryIdx,
    "task summaries precede slice-summary template",
  );

  // Task body inlined
  assert.match(prompt, /Task one did the thing/);
});

test("#4782 phase 3: buildCompleteSlicePrompt handles missing task summaries gracefully", async (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));
  invalidateAllCaches();

  seed(base, "M001");
  // Write roadmap + plan but no task summaries
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
    "# M001 Roadmap\n## Slices\n- [x] **S01: First** `risk:low` `depends:[]`\n",
  );
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-PLAN.md"),
    "# S01 Plan\n",
  );

  const prompt = await buildCompleteSlicePrompt("M001", "Composer Test", "S01", "First", base);

  // Still succeeds — prior-task-summaries resolver returns null when dir is empty
  assert.match(prompt, /### Milestone Roadmap/);
  assert.match(prompt, /### Slice Plan/);
  // No task summary blocks — they'd have a "### Task Summary:" prefix
  assert.ok(!prompt.includes("### Task Summary:"));
  // Roadmap still precedes slice plan despite the missing block
  const roadmapIdx = prompt.indexOf("### Milestone Roadmap");
  const planIdx = prompt.indexOf("### Slice Plan");
  assert.ok(roadmapIdx > -1 && planIdx > roadmapIdx);
});
