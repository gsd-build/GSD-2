/**
 * Tests for discuss-milestone content verification in verifyExpectedArtifact.
 *
 * Verifies that CONTEXT.md is checked for required sections, unreplaced
 * placeholders, and valid research_depth frontmatter — not just file existence.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { verifyExpectedArtifact } from "../auto-recovery.ts";

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-ctx-test-${randomUUID()}`);
  mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* */ }
}

/** Write a CONTEXT.md file inside the milestone directory. */
function writeContext(base: string, content: string): void {
  const dir = join(base, ".gsd", "milestones", "M001");
  writeFileSync(join(dir, "M001-CONTEXT.md"), content, "utf-8");
}

// Well-formed CONTEXT.md with all required sections and no placeholders
const WELL_FORMED = `# Milestone Context

## Project Description

This project builds a CLI tool for task management.

## Risks and Unknowns

- Dependency on external API availability
- Unknown performance characteristics under load

## Scope

- Core task CRUD operations
- CLI interface only, no GUI
`;

// CONTEXT.md with valid research_depth frontmatter
const WITH_VALID_FRONTMATTER = `---
research_depth: deep
---

# Milestone Context

## Project Description

A deep-research milestone exploring advanced caching strategies.

## Risks and Unknowns

- Cache invalidation complexity
- Memory pressure under high cardinality

## Scope

- Evaluate LRU, LFU, and ARC eviction policies
- Benchmark against baseline
`;

// CONTEXT.md without any frontmatter (simple discussion — should pass)
const NO_FRONTMATTER = `# Simple Discussion

## Project Description

Straightforward feature request.

## Risks and Unknowns

- None identified yet.

## Scope

- Single endpoint addition
`;

// ─── Missing required sections ────────────────────────────────────────────

test("discuss-milestone: returns false when CONTEXT.md is missing ## Project Description", () => {
  const base = makeTmpBase();
  try {
    writeContext(base, `# Context

## Risks and Unknowns

Some risks.

## Scope

Some scope.
`);
    assert.equal(verifyExpectedArtifact("discuss-milestone", "M001", base), false);
  } finally {
    cleanup(base);
  }
});

test("discuss-milestone: returns false when CONTEXT.md is missing ## Risks and Unknowns", () => {
  const base = makeTmpBase();
  try {
    writeContext(base, `# Context

## Project Description

Some description.

## Scope

Some scope.
`);
    assert.equal(verifyExpectedArtifact("discuss-milestone", "M001", base), false);
  } finally {
    cleanup(base);
  }
});

test("discuss-milestone: returns false when CONTEXT.md is missing ## Scope", () => {
  const base = makeTmpBase();
  try {
    writeContext(base, `# Context

## Project Description

Some description.

## Risks and Unknowns

Some risks.
`);
    assert.equal(verifyExpectedArtifact("discuss-milestone", "M001", base), false);
  } finally {
    cleanup(base);
  }
});

// ─── Placeholder detection ────────────────────────────────────────────────

test("discuss-milestone: returns false when CONTEXT.md contains {{description}} placeholder", () => {
  const base = makeTmpBase();
  try {
    writeContext(base, `# Context

## Project Description

{{description}}

## Risks and Unknowns

Some risks.

## Scope

Some scope.
`);
    assert.equal(verifyExpectedArtifact("discuss-milestone", "M001", base), false);
  } finally {
    cleanup(base);
  }
});

test("discuss-milestone: returns false when CONTEXT.md contains {{researchDepth}} in frontmatter", () => {
  const base = makeTmpBase();
  try {
    writeContext(base, `---
research_depth: {{researchDepth}}
---

# Context

## Project Description

Some description.

## Risks and Unknowns

Some risks.

## Scope

Some scope.
`);
    assert.equal(verifyExpectedArtifact("discuss-milestone", "M001", base), false);
  } finally {
    cleanup(base);
  }
});

// ─── Valid CONTEXT.md ─────────────────────────────────────────────────────

test("discuss-milestone: returns true for well-formed CONTEXT.md with all required sections", () => {
  const base = makeTmpBase();
  try {
    writeContext(base, WELL_FORMED);
    assert.equal(verifyExpectedArtifact("discuss-milestone", "M001", base), true);
  } finally {
    cleanup(base);
  }
});

test("discuss-milestone: returns true for CONTEXT.md without any frontmatter", () => {
  const base = makeTmpBase();
  try {
    writeContext(base, NO_FRONTMATTER);
    assert.equal(verifyExpectedArtifact("discuss-milestone", "M001", base), true);
  } finally {
    cleanup(base);
  }
});

test("discuss-milestone: returns true for CONTEXT.md with valid research_depth: deep frontmatter", () => {
  const base = makeTmpBase();
  try {
    writeContext(base, WITH_VALID_FRONTMATTER);
    assert.equal(verifyExpectedArtifact("discuss-milestone", "M001", base), true);
  } finally {
    cleanup(base);
  }
});

// ─── Invalid frontmatter ─────────────────────────────────────────────────

test("discuss-milestone: returns false for CONTEXT.md with invalid research_depth: mega", () => {
  const base = makeTmpBase();
  try {
    writeContext(base, `---
research_depth: mega
---

# Context

## Project Description

Some description.

## Risks and Unknowns

Some risks.

## Scope

Some scope.
`);
    assert.equal(verifyExpectedArtifact("discuss-milestone", "M001", base), false);
  } finally {
    cleanup(base);
  }
});
