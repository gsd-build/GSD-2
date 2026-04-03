import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("/gsd quick only creates a branch when git isolation is enabled (#3337)", () => {
  const src = readFileSync(
    join(import.meta.dirname, "..", "quick.ts"),
    "utf-8",
  );

  assert.ok(
    src.includes('const isolationMode = gitPrefs.isolation ?? "none";'),
    "quick.ts should derive the effective isolation mode before branch setup",
  );

  const guardedBranchCreation = /if\s*\(\s*isolationMode\s*!==\s*"none"\s*&&\s*current\s*!==\s*branchName\s*\)\s*\{[\s\S]*?runGit\(basePath,\s*\["checkout",\s*"-b",\s*branchName\]\);/.test(src);
  assert.ok(
    guardedBranchCreation,
    "quick branch creation must be gated behind non-none isolation",
  );
});
