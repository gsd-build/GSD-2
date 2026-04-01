/**
 * Regression test: slice CONTEXT.md from /gsd discuss must be inlined
 * into plan-slice and research-slice prompt builders.
 *
 * Before this fix, /gsd discuss wrote S##-CONTEXT.md but neither
 * buildPlanSlicePrompt() nor buildResearchSlicePrompt() read it,
 * making user decisions a dead-end artifact.
 *
 * We verify the fix by inspecting the source code of auto-prompts.ts
 * for the expected resolveSliceFile(…, "CONTEXT") calls, since the
 * runtime functions cannot be imported in unit tests due to deep
 * dependency chains (@gsd/native).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const autoPromptsPath = join(
  process.cwd(),
  "src/resources/extensions/gsd/auto-prompts.ts",
);
const source = readFileSync(autoPromptsPath, "utf-8");

/**
 * Extract the body of a named function from the source.
 * Finds `export async function <name>(` and captures until the next
 * `export` at column 0 (or EOF).
 */
function extractFunctionBody(name: string): string {
  const startRe = new RegExp(`export async function ${name}\\(`);
  const match = startRe.exec(source);
  if (!match) return "";
  const start = match.index;
  // Find the next top-level export after the match
  const rest = source.slice(start + match[0].length);
  const nextExport = rest.search(/\nexport /);
  return nextExport !== -1
    ? source.slice(start, start + match[0].length + nextExport)
    : source.slice(start);
}

// ─── buildPlanSlicePrompt ──────────────────────────────────────────────────

test("buildPlanSlicePrompt reads slice CONTEXT file", () => {
  const body = extractFunctionBody("buildPlanSlicePrompt");
  assert.ok(body.length > 0, "should find buildPlanSlicePrompt function");

  assert.ok(
    body.includes('resolveSliceFile(base, mid, sid, "CONTEXT")'),
    "buildPlanSlicePrompt should resolve slice CONTEXT file",
  );
  assert.ok(
    body.includes('relSliceFile(base, mid, sid, "CONTEXT")'),
    "buildPlanSlicePrompt should compute relative path for slice CONTEXT",
  );
  assert.ok(
    body.includes("Slice Context (from discussion)"),
    "buildPlanSlicePrompt should label the inline as slice context from discussion",
  );
});

// ─── buildResearchSlicePrompt ──────────────────────────────────────────────

test("buildResearchSlicePrompt reads slice CONTEXT file", () => {
  const body = extractFunctionBody("buildResearchSlicePrompt");
  assert.ok(body.length > 0, "should find buildResearchSlicePrompt function");

  assert.ok(
    body.includes('resolveSliceFile(base, mid, sid, "CONTEXT")'),
    "buildResearchSlicePrompt should resolve slice CONTEXT file",
  );
  assert.ok(
    body.includes('relSliceFile(base, mid, sid, "CONTEXT")'),
    "buildResearchSlicePrompt should compute relative path for slice CONTEXT",
  );
  assert.ok(
    body.includes("Slice Context (from discussion)"),
    "buildResearchSlicePrompt should label the inline as slice context from discussion",
  );
});

// ─── Negative: slice CONTEXT is optional (inlineFileOptional) ──────────────

test("slice CONTEXT inlining uses inlineFileOptional (graceful when missing)", () => {
  const planBody = extractFunctionBody("buildPlanSlicePrompt");
  const researchBody = extractFunctionBody("buildResearchSlicePrompt");

  assert.ok(
    planBody.includes("inlineFileOptional(sliceContextPath"),
    "plan-slice should use inlineFileOptional for slice CONTEXT",
  );
  assert.ok(
    researchBody.includes("inlineFileOptional(sliceContextPath"),
    "research-slice should use inlineFileOptional for slice CONTEXT",
  );
});
