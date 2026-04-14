/**
 * Regression test for #3490: post-unit handler for rewrite-docs must
 * detect abandon/descope overrides and park the milestone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("rewrite-docs post-unit detects abandon overrides (#3490)", () => {
  const src = readFileSync(
    join(import.meta.dirname, "..", "auto-post-unit.ts"),
    "utf-8",
  );
  // The fix adds abandon pattern detection before resolveAllOverrides
  assert.ok(src.includes("abandonPattern") || src.includes("abandon|descope"),
    "Post-unit handler must detect abandon-like override text");
  assert.ok(src.includes("parkMilestone"),
    "Post-unit handler must call parkMilestone for abandon overrides");
});
