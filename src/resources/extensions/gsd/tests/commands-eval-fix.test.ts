/**
 * Tests for /gsd eval-fix pure functions
 *
 * Tests: parseEvalFixArgs, findEvalReviewFile, parseGapsFromEvalReview,
 *        buildEvalFixOutputPath
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

import {
  parseEvalFixArgs,
  findEvalReviewFile,
  parseGapsFromEvalReview,
  buildEvalFixOutputPath,
  handleEvalFix,
} from "../commands-eval-fix.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTmpDir(): string {
  return mkdtempSync(join(tmpdir(), `gsd-eval-fix-test-${randomBytes(4).toString("hex")}-`));
}

function createSliceDir(basePath: string, milestoneId: string, sliceId: string): string {
  const sliceDir = join(basePath, ".gsd", "milestones", milestoneId, "slices", sliceId);
  mkdirSync(sliceDir, { recursive: true });
  return sliceDir;
}

// ── parseEvalFixArgs ──────────────────────────────────────────────────────────

describe("parseEvalFixArgs", () => {
  test("empty string → sliceId null", () => {
    const result = parseEvalFixArgs("");
    assert.equal(result.sliceId, null);
  });

  test("bare slice ID → sliceId set", () => {
    const result = parseEvalFixArgs("S01");
    assert.equal(result.sliceId, "S01");
  });

  test("slice ID with surrounding whitespace → trimmed", () => {
    const result = parseEvalFixArgs("  S02  ");
    assert.equal(result.sliceId, "S02");
  });
});

// ── findEvalReviewFile ────────────────────────────────────────────────────────

describe("findEvalReviewFile", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = createTmpDir();
  });

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  test("file exists → returns the path", () => {
    const sliceDir = createSliceDir(tmpBase, "M001", "S01");
    const reviewPath = join(sliceDir, "S01-EVAL-REVIEW.md");
    writeFileSync(reviewPath, "# Eval Review", "utf-8");
    const result = findEvalReviewFile(tmpBase, "M001", "S01");
    assert.equal(result, reviewPath);
  });

  test("file does not exist → returns null", () => {
    createSliceDir(tmpBase, "M001", "S01");
    const result = findEvalReviewFile(tmpBase, "M001", "S01");
    assert.equal(result, null);
  });

  test("directory does not exist → returns null", () => {
    const result = findEvalReviewFile(tmpBase, "M999", "S99");
    assert.equal(result, null);
  });
});

// ── parseGapsFromEvalReview ───────────────────────────────────────────────────

describe("parseGapsFromEvalReview", () => {
  test("empty string → empty array", () => {
    const result = parseGapsFromEvalReview("");
    assert.deepEqual(result, []);
  });

  test("markdown without Gap Analysis section → empty array", () => {
    const md = "# Eval Review\n\n## Recommendations\n\n- Fix things.";
    const result = parseGapsFromEvalReview(md);
    assert.deepEqual(result, []);
  });

  test("markdown with Gap Analysis section and bullet points → array of gap strings", () => {
    const md = `# Eval Review — S01\n\n## Gap Analysis\n\n- Missing unit tests for auth module\n- No error handling in API client\n\n## Recommendations\n\nFix it.`;
    const gaps = parseGapsFromEvalReview(md);
    assert.equal(gaps.length, 2);
    assert.ok(gaps[0].includes("Missing unit tests"));
    assert.ok(gaps[1].includes("No error handling"));
  });

  test("supports asterisk bullet syntax", () => {
    const md = `## Gap Analysis\n\n* Missing tests\n* No docs\n\n## Next`;
    const gaps = parseGapsFromEvalReview(md);
    assert.equal(gaps.length, 2);
    assert.ok(gaps[0].includes("Missing tests"));
  });

  test("Gap Analysis at end of file with no trailing section → still parses", () => {
    const md = `## Gap Analysis\n\n- Only gap here`;
    const gaps = parseGapsFromEvalReview(md);
    assert.equal(gaps.length, 1);
    assert.ok(gaps[0].includes("Only gap here"));
  });
});

// ── buildEvalFixOutputPath ────────────────────────────────────────────────────

describe("buildEvalFixOutputPath", () => {
  test("returns join(sliceDir, sliceId-EVAL-FIX.md)", () => {
    const result = buildEvalFixOutputPath("/some/path/S01", "S01");
    assert.equal(result, "/some/path/S01/S01-EVAL-FIX.md");
  });

  test("works with different slice IDs", () => {
    const result = buildEvalFixOutputPath("/base/milestones/M001/slices/S03", "S03");
    assert.equal(result, "/base/milestones/M001/slices/S03/S03-EVAL-FIX.md");
  });
});

// ── handleEvalFix — guard paths ───────────────────────────────────────────────

describe("handleEvalFix — guard paths", () => {
  test("no active milestone → warning notification", async () => {
    const tmp = mkdtempSync(join(tmpdir(), `gsd-eval-fix-handler-test-${randomBytes(4).toString("hex")}-`));
    const origCwd = process.cwd();
    try {
      // Empty directory → deriveState finds no milestone
      process.chdir(tmp);
      const notifications: Array<{ msg: string; level: string }> = [];
      const ctx = {
        notifications,
        ui: {
          notify(msg: string, level: string) { notifications.push({ msg, level }); },
          setStatus() {},
          setWidget() {},
          setFooter() {},
        },
      };
      const mockPi = { sendMessage: () => {} } as any;
      await handleEvalFix("", ctx as any, mockPi);
      assert.ok(notifications.some(n => n.level === "warning"));
    } finally {
      process.chdir(origCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
