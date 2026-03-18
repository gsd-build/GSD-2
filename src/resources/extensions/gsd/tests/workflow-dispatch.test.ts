/**
 * workflow-dispatch.test.ts — Unit tests for custom workflow dispatch resolution.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveWorkflowDispatch,
  resolveIterationItems,
  renderWorkflowPrompt,
  resolveWorkflowVerification,
  resolveWorkflowModelCategory,
  workflowCategoryToUnitType,
} from "../workflow-dispatch.js";
import { parseWorkflowDefinition } from "../workflow-definition.js";

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `gsd-wf-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeWorkflow(steps: string): ReturnType<typeof parseWorkflowDefinition> {
  return parseWorkflowDefinition(`---
name: Test Workflow
description: A test workflow
artifact_dir: .artifacts
steps:
${steps}
---
`);
}

// ─── renderWorkflowPrompt ─────────────────────────────────────────────────────

test("renderWorkflowPrompt substitutes variables", () => {
  const result = renderWorkflowPrompt(
    "Write to {{artifact_dir}}/{{step_name}}.md about {{iter_title}}",
    { artifact_dir: "/tmp/art", step_name: "research", iter_title: "AI" },
  );
  assert.equal(result, "Write to /tmp/art/research.md about AI");
});

test("renderWorkflowPrompt handles missing variables gracefully", () => {
  const result = renderWorkflowPrompt("Hello {{name}} and {{unknown}}", { name: "world" });
  assert.equal(result, "Hello world and {{unknown}}");
});

// ─── resolveIterationItems ────────────────────────────────────────────────────

test("resolveIterationItems with count produces fixed items", () => {
  const dir = makeTempDir();
  try {
    const items = resolveIterationItems(dir, {
      source: "any.md",
      pattern: ".*",
      idFormat: "ITEM{:02d}",
      count: 3,
    });
    assert.equal(items.length, 3);
    assert.equal(items[0]!.id, "ITEM01");
    assert.equal(items[1]!.id, "ITEM02");
    assert.equal(items[2]!.id, "ITEM03");
    assert.equal(items[0]!.index, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveIterationItems with pattern parses source file", () => {
  const dir = makeTempDir();
  try {
    writeFileSync(join(dir, "OUTLINE.md"), [
      "# My Book",
      "",
      "## Introduction",
      "Some intro text",
      "",
      "## Chapter One",
      "Content here",
      "",
      "## Conclusion",
    ].join("\n"));

    const items = resolveIterationItems(dir, {
      source: "OUTLINE.md",
      pattern: "^## ",
      idFormat: "CH{:02d}",
    });
    assert.equal(items.length, 3);
    assert.equal(items[0]!.id, "CH01");
    assert.equal(items[0]!.title, "Introduction");
    assert.equal(items[1]!.id, "CH02");
    assert.equal(items[1]!.title, "Chapter One");
    assert.equal(items[2]!.id, "CH03");
    assert.equal(items[2]!.title, "Conclusion");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveIterationItems returns empty for missing source", () => {
  const dir = makeTempDir();
  try {
    const items = resolveIterationItems(dir, {
      source: "MISSING.md",
      pattern: "^## ",
      idFormat: "X{:02d}",
    });
    assert.equal(items.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── resolveWorkflowDispatch ──────────────────────────────────────────────────

test("dispatches first incomplete step", async () => {
  const dir = makeTempDir();
  try {
    const workflow = makeWorkflow(`
  - id: research
    name: Research
    produces: RESEARCH.md
    prompt: Research the topic.
  - id: outline
    name: Outline
    produces: OUTLINE.md
    requires: [research]
    prompt: Create outline.
`)!;

    const result = await resolveWorkflowDispatch(workflow, dir);
    assert.equal(result.action, "dispatch");
    if (result.action === "dispatch") {
      assert.equal(result.unitType, "wf/Test Workflow/research");
      assert.equal(result.unitId, "research");
      assert.ok(result.prompt.includes("Research the topic"));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("skips completed steps and dispatches next", async () => {
  const dir = makeTempDir();
  try {
    const artDir = join(dir, ".artifacts");
    mkdirSync(artDir, { recursive: true });
    writeFileSync(join(artDir, "RESEARCH.md"), "Done");

    const workflow = makeWorkflow(`
  - id: research
    name: Research
    produces: RESEARCH.md
    prompt: Research the topic.
  - id: outline
    name: Outline
    produces: OUTLINE.md
    requires: [research]
    prompt: Create outline.
`)!;

    const result = await resolveWorkflowDispatch(workflow, dir);
    assert.equal(result.action, "dispatch");
    if (result.action === "dispatch") {
      assert.equal(result.unitType, "wf/Test Workflow/outline");
      assert.equal(result.unitId, "outline");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("returns stop when all steps complete", async () => {
  const dir = makeTempDir();
  try {
    const artDir = join(dir, ".artifacts");
    mkdirSync(artDir, { recursive: true });
    writeFileSync(join(artDir, "RESEARCH.md"), "Done");
    writeFileSync(join(artDir, "OUTLINE.md"), "Done");

    const workflow = makeWorkflow(`
  - id: research
    name: Research
    produces: RESEARCH.md
    prompt: Research.
  - id: outline
    name: Outline
    produces: OUTLINE.md
    requires: [research]
    prompt: Outline.
`)!;

    const result = await resolveWorkflowDispatch(workflow, dir);
    assert.equal(result.action, "stop");
    if (result.action === "stop") {
      assert.ok(result.reason.includes("complete"));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("skips step when dependencies not met", async () => {
  const dir = makeTempDir();
  try {
    const workflow = makeWorkflow(`
  - id: step1
    name: Step 1
    produces: A.md
    prompt: Do A.
  - id: step2
    name: Step 2
    produces: B.md
    requires: [step1]
    prompt: Do B.
`)!;

    // step2 depends on step1, which isn't done. Only step1 should dispatch.
    const result = await resolveWorkflowDispatch(workflow, dir);
    assert.equal(result.action, "dispatch");
    if (result.action === "dispatch") {
      assert.ok(result.unitType.includes("step1"));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Verification Resolution ──────────────────────────────────────────────────

test("resolveWorkflowVerification returns step verification", () => {
  const workflow = makeWorkflow(`
  - id: step1
    name: Step 1
    produces: OUT.md
    verification: inherit
    prompt: Do it.
`)!;

  const result = resolveWorkflowVerification(workflow, "wf/Test Workflow/step1");
  assert.equal(result, "inherit");
});

test("resolveWorkflowVerification falls back to workflow default", () => {
  const content = `---
name: Test
description: Test
artifact_dir: .art
verification: inherit
steps:
  - id: step1
    name: Step 1
    produces: OUT.md
    prompt: Do it
---
`;
  const workflow = parseWorkflowDefinition(content)!;
  // step1 has verification: none, so it falls through to workflow default
  const result = resolveWorkflowVerification(workflow, "wf/Test/step1");
  assert.equal(result, "inherit");
});

// ─── Model Category Resolution ────────────────────────────────────────────────

test("resolveWorkflowModelCategory returns step category", () => {
  const workflow = makeWorkflow(`
  - id: step1
    name: Step 1
    model_category: research
    produces: OUT.md
    prompt: Do it.
`)!;

  assert.equal(resolveWorkflowModelCategory(workflow, "wf/Test Workflow/step1"), "research");
});

test("resolveWorkflowModelCategory returns undefined for unknown step", () => {
  const workflow = makeWorkflow(`
  - id: step1
    name: Step 1
    produces: OUT.md
    prompt: Do it.
`)!;

  assert.equal(resolveWorkflowModelCategory(workflow, "wf/Test Workflow/unknown"), undefined);
});

// ─── workflowCategoryToUnitType ───────────────────────────────────────────────

test("workflowCategoryToUnitType maps categories correctly", () => {
  assert.equal(workflowCategoryToUnitType("research"), "research-milestone");
  assert.equal(workflowCategoryToUnitType("planning"), "plan-milestone");
  assert.equal(workflowCategoryToUnitType("execution"), "execute-task");
  assert.equal(workflowCategoryToUnitType("completion"), "complete-slice");
  assert.equal(workflowCategoryToUnitType("unknown"), "execute-task");
});
