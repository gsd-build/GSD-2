/**
 * workflow-definition.test.ts — Unit tests for workflow definition parsing and validation.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { parseWorkflowDefinition, validateWorkflowDefinition } from "../workflow-definition.js";

// ─── Valid Workflow ───────────────────────────────────────────────────────────

const VALID_WORKFLOW = `---
name: Write Ebook
description: Research, outline, draft, and edit an ebook
version: 1
author: someone
artifact_dir: .gsd/workflows/ebook

steps:
  - id: research
    name: Research Topic
    model_category: research
    produces: RESEARCH.md
    prompt: |
      Research the topic thoroughly. Write findings to {{artifact_dir}}/RESEARCH.md.

  - id: outline
    name: Create Outline
    model_category: planning
    produces: OUTLINE.md
    requires: [research]
    prompt: |
      Read {{artifact_dir}}/RESEARCH.md. Create a chapter outline.

  - id: draft
    name: Draft Chapters
    model_category: execution
    produces: chapters/
    requires: [outline]
    iterate:
      source: OUTLINE.md
      pattern: "^## "
      id_format: "CH{:02d}"
    prompt: |
      Write chapter {{iter_index}}: "{{iter_title}}".

  - id: edit
    name: Edit & Polish
    model_category: completion
    produces: FINAL.md
    requires: [draft]
    prompt: |
      Read all chapter files. Compile into {{artifact_dir}}/FINAL.md.

isolation: none
verification: none
---

# Write Ebook

A workflow for writing an ebook.
`;

test("parseWorkflowDefinition parses a valid workflow", () => {
  const def = parseWorkflowDefinition(VALID_WORKFLOW);
  assert.ok(def);
  assert.equal(def.name, "Write Ebook");
  assert.equal(def.description, "Research, outline, draft, and edit an ebook");
  assert.equal(def.version, 1);
  assert.equal(def.author, "someone");
  assert.equal(def.artifactDir, ".gsd/workflows/ebook");
  assert.equal(def.isolation, "none");
  assert.equal(def.verification, "none");
  assert.equal(def.steps.length, 4);
});

test("step properties are parsed correctly", () => {
  const def = parseWorkflowDefinition(VALID_WORKFLOW)!;
  const research = def.steps[0]!;
  assert.equal(research.id, "research");
  assert.equal(research.name, "Research Topic");
  assert.equal(research.modelCategory, "research");
  assert.equal(research.produces, "RESEARCH.md");
  assert.deepEqual(research.requires, []);
  assert.equal(research.verification, "none");
  assert.ok(research.promptTemplate.includes("Research the topic"));
});

test("step requires are parsed correctly", () => {
  const def = parseWorkflowDefinition(VALID_WORKFLOW)!;
  const outline = def.steps[1]!;
  assert.deepEqual(outline.requires, ["research"]);
});

test("step iterate config is parsed correctly", () => {
  const def = parseWorkflowDefinition(VALID_WORKFLOW)!;
  const draft = def.steps[2]!;
  assert.ok(draft.iterate);
  assert.equal(draft.iterate!.source, "OUTLINE.md");
  assert.equal(draft.iterate!.pattern, "^## ");
  assert.equal(draft.iterate!.idFormat, "CH{:02d}");
});

test("model_category defaults to execution when missing", () => {
  const content = `---
name: Test
description: Test workflow
artifact_dir: .gsd/test
steps:
  - id: step1
    name: Step 1
    produces: OUT.md
    prompt: Do something
---
`;
  const def = parseWorkflowDefinition(content)!;
  assert.equal(def.steps[0]!.modelCategory, "execution");
});

// ─── Invalid Workflows ───────────────────────────────────────────────────────

test("parseWorkflowDefinition returns null for missing frontmatter", () => {
  assert.equal(parseWorkflowDefinition("No frontmatter here"), null);
});

test("parseWorkflowDefinition returns null for missing name", () => {
  const content = `---
description: No name
artifact_dir: .gsd/test
steps:
  - id: step1
    name: Step 1
    produces: OUT.md
    prompt: Do it
---
`;
  assert.equal(parseWorkflowDefinition(content), null);
});

test("parseWorkflowDefinition returns null for empty steps", () => {
  const content = `---
name: Test
description: Empty steps
artifact_dir: .gsd/test
steps: []
---
`;
  assert.equal(parseWorkflowDefinition(content), null);
});

test("parseWorkflowDefinition returns null for duplicate step IDs", () => {
  const content = `---
name: Test
description: Dupe IDs
artifact_dir: .gsd/test
steps:
  - id: step1
    name: Step 1
    produces: A.md
    prompt: Do A
  - id: step1
    name: Step 2
    produces: B.md
    prompt: Do B
---
`;
  assert.equal(parseWorkflowDefinition(content), null);
});

test("parseWorkflowDefinition returns null for invalid requires reference", () => {
  const content = `---
name: Test
description: Bad requires
artifact_dir: .gsd/test
steps:
  - id: step1
    name: Step 1
    produces: A.md
    requires: [nonexistent]
    prompt: Do A
---
`;
  assert.equal(parseWorkflowDefinition(content), null);
});

test("parseWorkflowDefinition returns null for self-referencing requires", () => {
  const content = `---
name: Test
description: Self ref
artifact_dir: .gsd/test
steps:
  - id: step1
    name: Step 1
    produces: A.md
    requires: [step1]
    prompt: Do A
---
`;
  assert.equal(parseWorkflowDefinition(content), null);
});

test("parseWorkflowDefinition detects dependency cycles", () => {
  const content = `---
name: Test
description: Cycle
artifact_dir: .gsd/test
steps:
  - id: a
    name: A
    produces: A.md
    requires: [b]
    prompt: Do A
  - id: b
    name: B
    produces: B.md
    requires: [a]
    prompt: Do B
---
`;
  assert.equal(parseWorkflowDefinition(content), null);
});

// ─── Validation ──────────────────────────────────────────────────────────────

test("validateWorkflowDefinition returns valid for good workflow", () => {
  const result = validateWorkflowDefinition(VALID_WORKFLOW);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateWorkflowDefinition reports missing frontmatter", () => {
  const result = validateWorkflowDefinition("No frontmatter");
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes("frontmatter")));
});

test("validateWorkflowDefinition reports missing fields", () => {
  const content = `---
description: No name field
steps: []
---
`;
  const result = validateWorkflowDefinition(content);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes("name")));
});

// ─── Verification Mode Parsing ───────────────────────────────────────────────

test("workflow-level verification: inherit", () => {
  const content = `---
name: Test
description: Test
artifact_dir: .gsd/test
verification: inherit
steps:
  - id: step1
    name: Step 1
    produces: OUT.md
    prompt: Do it
---
`;
  const def = parseWorkflowDefinition(content)!;
  assert.equal(def.verification, "inherit");
});

test("step-level verification with commands", () => {
  const content = `---
name: Test
description: Test
artifact_dir: .gsd/test
steps:
  - id: step1
    name: Step 1
    produces: OUT.md
    verification:
      commands:
        - command: npm test
          blocking: true
        - command: npm run lint
          blocking: false
    prompt: Do it
---
`;
  const def = parseWorkflowDefinition(content)!;
  const v = def.steps[0]!.verification;
  assert.notEqual(v, "none");
  assert.notEqual(v, "inherit");
  assert.ok(typeof v === "object");
  assert.equal(v.commands.length, 2);
  assert.equal(v.commands[0]!.command, "npm test");
  assert.equal(v.commands[0]!.blocking, true);
  assert.equal(v.commands[1]!.command, "npm run lint");
  assert.equal(v.commands[1]!.blocking, false);
});

// ─── Isolation Mode ──────────────────────────────────────────────────────────

test("isolation defaults to none", () => {
  const content = `---
name: Test
description: Test
artifact_dir: .gsd/test
steps:
  - id: step1
    name: Step 1
    produces: OUT.md
    prompt: Do it
---
`;
  const def = parseWorkflowDefinition(content)!;
  assert.equal(def.isolation, "none");
});

test("isolation: worktree is parsed", () => {
  const content = `---
name: Test
description: Test
artifact_dir: .gsd/test
isolation: worktree
steps:
  - id: step1
    name: Step 1
    produces: OUT.md
    prompt: Do it
---
`;
  const def = parseWorkflowDefinition(content)!;
  assert.equal(def.isolation, "worktree");
});
