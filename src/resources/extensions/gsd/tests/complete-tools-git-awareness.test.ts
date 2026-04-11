/**
 * complete-tools-git-awareness.test.ts — Regression test for #3194.
 *
 * Completion tools must check git status of keyFiles before marking
 * work complete and include a warning in the result when files are
 * uncommitted.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolsDir = join(__dirname, "..", "tools");

const taskSrc = readFileSync(join(toolsDir, "complete-task.ts"), "utf-8");
const sliceSrc = readFileSync(join(toolsDir, "complete-slice.ts"), "utf-8");
const milestoneSrc = readFileSync(join(toolsDir, "complete-milestone.ts"), "utf-8");

describe("#3194: completion tools git awareness", () => {
  test("complete-task.ts calls checkUncommittedKeyFiles", () => {
    assert.ok(
      taskSrc.includes("checkUncommittedKeyFiles"),
      "complete-task.ts must call checkUncommittedKeyFiles()",
    );
  });

  test("complete-slice.ts calls checkUncommittedKeyFiles", () => {
    assert.ok(
      sliceSrc.includes("checkUncommittedKeyFiles"),
      "complete-slice.ts must call checkUncommittedKeyFiles()",
    );
  });

  test("complete-milestone.ts calls checkUncommittedKeyFiles", () => {
    assert.ok(
      milestoneSrc.includes("checkUncommittedKeyFiles"),
      "complete-milestone.ts must call checkUncommittedKeyFiles()",
    );
  });

  test("at least one tool result type includes uncommittedWarning field", () => {
    const allSrc = taskSrc + sliceSrc + milestoneSrc;
    assert.ok(
      allSrc.includes("uncommittedWarning"),
      "at least one tool result type must include uncommittedWarning field",
    );
  });

  test("git status --porcelain or spawnSync present in tool sources", () => {
    const allSrc = taskSrc + sliceSrc + milestoneSrc;
    assert.ok(
      allSrc.includes("--porcelain") || allSrc.includes("spawnSync"),
      "git status --porcelain or spawnSync must be present in tool sources",
    );
  });
});
