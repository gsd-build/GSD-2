/**
 * Unit tests for definition-loader.ts and graphFromDefinition().
 *
 * Covers V1 YAML schema validation (valid + various rejection cases),
 * filesystem loading, snake_case → camelCase conversion, forward
 * compatibility with unknown fields, and graph generation from definitions.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  loadDefinition,
  validateDefinition,
} from "../definition-loader.ts";
import type { WorkflowDefinition, StepDefinition, VerifyPolicy, IterateConfig } from "../definition-loader.ts";
import { graphFromDefinition } from "../graph.ts";
import type { WorkflowGraph } from "../graph.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "gsd-defloader-test-"));
}

/** Write a YAML string into a temp definitions directory. Returns the dir path. */
function writeDefYaml(yaml: string, name = "test-workflow"): string {
  const dir = makeTmpDir();
  writeFileSync(join(dir, `${name}.yaml`), yaml, "utf-8");
  return dir;
}

const VALID_3STEP_YAML = `
version: 1
name: "test-workflow"
description: "A test workflow"
params:
  topic: "AI"
steps:
  - id: research
    name: "Research the topic"
    prompt: "Research {{topic}} and write findings to research.md"
    requires: []
    produces:
      - research.md
  - id: outline
    name: "Create outline"
    prompt: "Based on research.md, create an outline in outline.md"
    requires: [research]
    produces:
      - outline.md
  - id: draft
    name: "Write draft"
    prompt: "Write a draft based on outline.md"
    requires: [outline]
    produces:
      - draft.md
`;

// ─── loadDefinition: valid YAML ──────────────────────────────────────────

test("loadDefinition: valid 3-step YAML returns correct structure", () => {
  const dir = writeDefYaml(VALID_3STEP_YAML);
  try {
    const def = loadDefinition(dir, "test-workflow");

    assert.equal(def.version, 1);
    assert.equal(def.name, "test-workflow");
    assert.equal(def.description, "A test workflow");
    assert.deepEqual(def.params, { topic: "AI" });
    assert.equal(def.steps.length, 3);

    // Step 1: research
    assert.equal(def.steps[0].id, "research");
    assert.equal(def.steps[0].name, "Research the topic");
    assert.equal(def.steps[0].prompt, "Research {{topic}} and write findings to research.md");
    assert.deepEqual(def.steps[0].requires, []);
    assert.deepEqual(def.steps[0].produces, ["research.md"]);

    // Step 2: outline — depends on research
    assert.equal(def.steps[1].id, "outline");
    assert.deepEqual(def.steps[1].requires, ["research"]);

    // Step 3: draft — depends on outline
    assert.equal(def.steps[2].id, "draft");
    assert.deepEqual(def.steps[2].requires, ["outline"]);
    assert.deepEqual(def.steps[2].produces, ["draft.md"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── validateDefinition: rejection cases ─────────────────────────────────

test("validateDefinition: missing version → error", () => {
  const result = validateDefinition({
    name: "test",
    steps: [{ id: "a", name: "A", prompt: "do A" }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("version")));
});

test("validateDefinition: version 2 (unsupported) → error", () => {
  const result = validateDefinition({
    version: 2,
    name: "test",
    steps: [{ id: "a", name: "A", prompt: "do A" }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Unsupported version: 2")));
});

test("validateDefinition: missing step id → error", () => {
  const result = validateDefinition({
    version: 1,
    name: "test",
    steps: [{ name: "A", prompt: "do A" }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("index 0") && e.includes("id")));
});

test("validateDefinition: missing step prompt → error", () => {
  const result = validateDefinition({
    version: 1,
    name: "test",
    steps: [{ id: "a", name: "A" }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("index 0") && e.includes("prompt")));
});

test("validateDefinition: produces with '..' path traversal → error", () => {
  const result = validateDefinition({
    version: 1,
    name: "test",
    steps: [{ id: "a", name: "A", prompt: "do A", produces: ["../secret.txt"] }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("..") && e.includes("produces")));
});

test("validateDefinition: unknown fields (context_from, iterate) → accepted silently", () => {
  const result = validateDefinition({
    version: 1,
    name: "test",
    future_top_level_field: true,
    steps: [{
      id: "a",
      name: "A",
      prompt: "do A",
      context_from: ["other-step"],
      iterate: { source: "file.md", pattern: "^## (.+)" },
      some_future_field: 42,
    }],
  });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateDefinition: collects multiple errors in one pass", () => {
  const result = validateDefinition({
    // missing version and name
    steps: [
      { id: "a" }, // missing name and prompt
      { name: "B", prompt: "do B" }, // missing id
    ],
  });
  assert.equal(result.valid, false);
  // Should have errors for: version, name, step 0 name, step 0 prompt, step 1 id
  assert.ok(result.errors.length >= 4, `Expected ≥4 errors, got ${result.errors.length}: ${result.errors.join("; ")}`);
});

// ─── loadDefinition: error cases ─────────────────────────────────────────

test("loadDefinition: missing file → descriptive error", () => {
  const dir = makeTmpDir();
  try {
    assert.throws(
      () => loadDefinition(dir, "nonexistent"),
      (err: Error) => {
        assert.ok(err.message.includes("not found"));
        assert.ok(err.message.includes("nonexistent.yaml"));
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadDefinition: invalid YAML schema → descriptive error", () => {
  const dir = writeDefYaml(`
version: 2
name: "bad"
steps:
  - id: a
    name: "A"
    prompt: "do A"
`);
  try {
    assert.throws(
      () => loadDefinition(dir, "test-workflow"),
      (err: Error) => {
        assert.ok(err.message.includes("Invalid workflow definition"));
        assert.ok(err.message.includes("Unsupported version"));
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── loadDefinition: snake_case → camelCase conversion ───────────────────

test("loadDefinition: depends_on in YAML maps to requires in TypeScript", () => {
  const dir = writeDefYaml(`
version: 1
name: "dep-test"
steps:
  - id: first
    name: "First"
    prompt: "do first"
  - id: second
    name: "Second"
    prompt: "do second"
    depends_on: [first]
`);
  try {
    const def = loadDefinition(dir, "test-workflow");
    assert.deepEqual(def.steps[1].requires, ["first"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadDefinition: context_from in YAML maps to contextFrom in TypeScript", () => {
  const dir = writeDefYaml(`
version: 1
name: "ctx-test"
steps:
  - id: first
    name: "First"
    prompt: "do first"
  - id: second
    name: "Second"
    prompt: "do second"
    context_from: [first]
`);
  try {
    const def = loadDefinition(dir, "test-workflow");
    assert.deepEqual(def.steps[1].contextFrom, ["first"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── validateDefinition: iterate field validation ────────────────────────

test("validateDefinition: valid iterate config accepted", () => {
  const result = validateDefinition({
    version: 1,
    name: "test",
    steps: [{
      id: "a",
      name: "A",
      prompt: "do A",
      iterate: { source: "outline.md", pattern: "^## (.+)" },
    }],
  });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateDefinition: iterate missing source → error", () => {
  const result = validateDefinition({
    version: 1,
    name: "test",
    steps: [{
      id: "a",
      name: "A",
      prompt: "do A",
      iterate: { pattern: "^## (.+)" },
    }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("source")));
});

test("validateDefinition: iterate source with .. → error", () => {
  const result = validateDefinition({
    version: 1,
    name: "test",
    steps: [{
      id: "a",
      name: "A",
      prompt: "do A",
      iterate: { source: "../escape.md", pattern: "(.+)" },
    }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("path traversal") || e.includes("..")));
});

test("validateDefinition: iterate invalid regex → error", () => {
  const result = validateDefinition({
    version: 1,
    name: "test",
    steps: [{
      id: "a",
      name: "A",
      prompt: "do A",
      iterate: { source: "f.md", pattern: "[invalid" },
    }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("regex")));
});

test("validateDefinition: iterate pattern without capture group → error", () => {
  const result = validateDefinition({
    version: 1,
    name: "test",
    steps: [{
      id: "a",
      name: "A",
      prompt: "do A",
      iterate: { source: "f.md", pattern: "^## .+" },
    }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("capture group")));
});

// ─── graphFromDefinition ─────────────────────────────────────────────────

test("graphFromDefinition: 3-step definition → 3 pending steps with correct dependencies", () => {
  const def: WorkflowDefinition = {
    version: 1,
    name: "graph-test",
    steps: [
      { id: "step-1", name: "First", prompt: "Do step 1", requires: [], produces: [] },
      { id: "step-2", name: "Second", prompt: "Do step 2", requires: ["step-1"], produces: [] },
      { id: "step-3", name: "Third", prompt: "Do step 3", requires: ["step-2"], produces: ["out.md"] },
    ],
  };

  const graph = graphFromDefinition(def);

  assert.equal(graph.steps.length, 3);
  assert.equal(graph.metadata.name, "graph-test");
  assert.ok(graph.metadata.createdAt, "createdAt should be set");

  // All steps pending
  for (const step of graph.steps) {
    assert.equal(step.status, "pending");
  }

  // Step details
  assert.equal(graph.steps[0].id, "step-1");
  assert.equal(graph.steps[0].title, "First");
  assert.equal(graph.steps[0].prompt, "Do step 1");
  assert.deepEqual(graph.steps[0].dependsOn, []);

  assert.equal(graph.steps[1].id, "step-2");
  assert.deepEqual(graph.steps[1].dependsOn, ["step-1"]);

  assert.equal(graph.steps[2].id, "step-3");
  assert.deepEqual(graph.steps[2].dependsOn, ["step-2"]);
});

// ─── validateDefinition: verify field validation ─────────────────────────

test("validateDefinition: valid content-heuristic verify → accepted", () => {
  const result = validateDefinition({
    version: 1,
    name: "test",
    steps: [{
      id: "a",
      name: "A",
      prompt: "do A",
      verify: { policy: "content-heuristic", minSize: 100, pattern: "^## " },
    }],
  });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateDefinition: valid shell-command verify → accepted", () => {
  const result = validateDefinition({
    version: 1,
    name: "test",
    steps: [{
      id: "a",
      name: "A",
      prompt: "do A",
      verify: { policy: "shell-command", command: "cat output.md | grep '^## '" },
    }],
  });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateDefinition: valid prompt-verify → accepted", () => {
  const result = validateDefinition({
    version: 1,
    name: "test",
    steps: [{
      id: "a",
      name: "A",
      prompt: "do A",
      verify: { policy: "prompt-verify", prompt: "Does the output contain at least 3 sections?" },
    }],
  });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateDefinition: valid human-review verify → accepted", () => {
  const result = validateDefinition({
    version: 1,
    name: "test",
    steps: [{
      id: "a",
      name: "A",
      prompt: "do A",
      verify: { policy: "human-review" },
    }],
  });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateDefinition: invalid verify policy name → rejected", () => {
  const result = validateDefinition({
    version: 1,
    name: "test",
    steps: [{
      id: "a",
      name: "A",
      prompt: "do A",
      verify: { policy: "magic-check" },
    }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("verify.policy must be one of")));
});

test("validateDefinition: shell-command missing command → rejected", () => {
  const result = validateDefinition({
    version: 1,
    name: "test",
    steps: [{
      id: "a",
      name: "A",
      prompt: "do A",
      verify: { policy: "shell-command" },
    }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('requires a non-empty "command"')));
});

test("validateDefinition: prompt-verify missing prompt → rejected", () => {
  const result = validateDefinition({
    version: 1,
    name: "test",
    steps: [{
      id: "a",
      name: "A",
      prompt: "do A",
      verify: { policy: "prompt-verify" },
    }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('requires a non-empty "prompt"')));
});
