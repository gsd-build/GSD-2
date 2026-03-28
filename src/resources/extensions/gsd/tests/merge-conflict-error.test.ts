/**
 * merge-conflict-error.test.ts — Unit tests for MergeConflictError from errors.ts.
 *
 * Verifies that MergeConflictError was correctly moved to errors.ts,
 * is no longer re-exported from git-self-heal.ts, and behaves correctly.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { MergeConflictError, GSDError, GSD_MERGE_CONFLICT } from "../errors.js";

// ── Importability ─────────────────────────────────────────────────────────────

test("MergeConflictError is importable from errors.ts", () => {
  assert.ok(MergeConflictError !== undefined, "MergeConflictError should be exported from errors.ts");
  assert.equal(typeof MergeConflictError, "function");
});

// ── Prototype chain ───────────────────────────────────────────────────────────

test("MergeConflictError instance is instanceof Error", () => {
  const err = new MergeConflictError(["src/foo.ts"], "squash", "feature/x", "main");
  assert.ok(err instanceof Error);
});

test("MergeConflictError instance is instanceof GSDError", () => {
  const err = new MergeConflictError(["src/foo.ts"], "squash", "feature/x", "main");
  assert.ok(err instanceof GSDError);
});

test("MergeConflictError instance is instanceof MergeConflictError", () => {
  const err = new MergeConflictError(["src/foo.ts"], "squash", "feature/x", "main");
  assert.ok(err instanceof MergeConflictError);
});

// ── Properties ────────────────────────────────────────────────────────────────

test("MergeConflictError sets conflictedFiles correctly", () => {
  const files = ["src/auth.ts", "src/token.ts"];
  const err = new MergeConflictError(files, "merge", "feature/auth", "main");
  assert.deepEqual(err.conflictedFiles, files);
});

test("MergeConflictError sets strategy correctly for squash", () => {
  const err = new MergeConflictError(["src/a.ts"], "squash", "feature/x", "main");
  assert.equal(err.strategy, "squash");
});

test("MergeConflictError sets strategy correctly for merge", () => {
  const err = new MergeConflictError(["src/a.ts"], "merge", "feature/x", "main");
  assert.equal(err.strategy, "merge");
});

test("MergeConflictError sets branch correctly", () => {
  const err = new MergeConflictError([], "squash", "feature/my-branch", "main");
  assert.equal(err.branch, "feature/my-branch");
});

test("MergeConflictError sets mainBranch correctly", () => {
  const err = new MergeConflictError([], "squash", "feature/x", "develop");
  assert.equal(err.mainBranch, "develop");
});

test("MergeConflictError has name 'MergeConflictError'", () => {
  const err = new MergeConflictError([], "squash", "feature/x", "main");
  assert.equal(err.name, "MergeConflictError");
});

test("MergeConflictError has code GSD_MERGE_CONFLICT", () => {
  const err = new MergeConflictError([], "squash", "feature/x", "main");
  assert.equal(err.code, GSD_MERGE_CONFLICT);
});

// ── Error message ─────────────────────────────────────────────────────────────

test("MergeConflictError message includes branch name", () => {
  const err = new MergeConflictError(["src/foo.ts"], "squash", "feature/my-pr", "main");
  assert.ok(err.message.includes("feature/my-pr"), `message: "${err.message}"`);
});

test("MergeConflictError message includes mainBranch name", () => {
  const err = new MergeConflictError(["src/foo.ts"], "squash", "feature/x", "trunk");
  assert.ok(err.message.includes("trunk"), `message: "${err.message}"`);
});

test("MergeConflictError message includes conflicted file count", () => {
  const err = new MergeConflictError(["a.ts", "b.ts", "c.ts"], "merge", "feature/x", "main");
  assert.ok(err.message.includes("3"), `message: "${err.message}"`);
});

// ── Not re-exported from git-self-heal.ts ────────────────────────────────────

test("git-self-heal.ts does not re-export MergeConflictError", async () => {
  // Dynamic import to check what the module actually exports at runtime
  const gitSelfHeal = await import("../git-self-heal.js");
  assert.ok(
    !("MergeConflictError" in gitSelfHeal),
    "MergeConflictError should not be exported from git-self-heal.ts — it moved to errors.ts",
  );
});
