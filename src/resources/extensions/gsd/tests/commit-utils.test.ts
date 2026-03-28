/**
 * commit-utils.test.ts — Unit tests for inferCommitType and buildTaskCommitMessage.
 *
 * These are pure functions with no side effects, so tests are straightforward.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { inferCommitType, buildTaskCommitMessage } from "../commit-utils.js";

// ── inferCommitType ───────────────────────────────────────────────────────────

test("inferCommitType returns 'fix' for title containing 'fix'", () => {
  assert.equal(inferCommitType("Fix broken auth"), "fix");
});

test("inferCommitType returns 'fix' for title containing 'bug'", () => {
  assert.equal(inferCommitType("Resolved a bug in parser"), "fix");
});

test("inferCommitType returns 'fix' for title containing 'patch'", () => {
  assert.equal(inferCommitType("Apply patch to retry logic"), "fix");
});

test("inferCommitType returns 'feat' for unknown title", () => {
  assert.equal(inferCommitType("Add new dashboard widget"), "feat");
});

test("inferCommitType returns 'feat' for completely generic title", () => {
  assert.equal(inferCommitType("Update some things"), "feat");
});

test("inferCommitType returns 'refactor' for title containing 'refactor'", () => {
  assert.equal(inferCommitType("Refactor git-service into modules"), "refactor");
});

test("inferCommitType returns 'refactor' for title containing 'restructure'", () => {
  assert.equal(inferCommitType("Restructure the domain layer"), "refactor");
});

test("inferCommitType returns 'docs' for title containing 'doc'", () => {
  assert.equal(inferCommitType("Update doc comments"), "docs");
});

test("inferCommitType returns 'docs' for title containing 'readme'", () => {
  assert.equal(inferCommitType("Update README with new examples"), "docs");
});

test("inferCommitType returns 'test' for title containing 'test'", () => {
  assert.equal(inferCommitType("Add test coverage for auth module"), "test");
});

test("inferCommitType returns 'test' for title containing 'spec'", () => {
  assert.equal(inferCommitType("Add spec for scheduler"), "test");
});

test("inferCommitType is case-insensitive", () => {
  assert.equal(inferCommitType("FIX the thing"), "fix");
  assert.equal(inferCommitType("REFACTOR all the things"), "refactor");
});

test("inferCommitType uses oneLiner as tiebreaker when title is generic", () => {
  // Title is generic but oneLiner contains a keyword → should match
  assert.equal(inferCommitType("Improve scheduler", "Fix race condition in worker"), "fix");
});

// ── buildTaskCommitMessage ────────────────────────────────────────────────────

test("buildTaskCommitMessage produces conventional commit format 'type: description'", () => {
  const msg = buildTaskCommitMessage({
    taskId: "TASK-1",
    taskTitle: "Add user authentication",
    oneLiner: "Implement JWT-based auth with refresh tokens",
  });
  assert.match(msg, /^feat: .+/);
});

test("buildTaskCommitMessage includes GSD-Task trailer", () => {
  const msg = buildTaskCommitMessage({
    taskId: "TASK-42",
    taskTitle: "Add feature",
  });
  assert.ok(msg.includes("GSD-Task: TASK-42"), "GSD-Task trailer missing");
});

test("buildTaskCommitMessage includes 'Resolves #N' trailer when issueNumber is set", () => {
  const msg = buildTaskCommitMessage({
    taskId: "TASK-7",
    taskTitle: "Fix crash on startup",
    issueNumber: 2988,
  });
  assert.ok(msg.includes("Resolves #2988"), "Resolves trailer missing");
});

test("buildTaskCommitMessage omits Resolves trailer when issueNumber is not set", () => {
  const msg = buildTaskCommitMessage({
    taskId: "TASK-7",
    taskTitle: "Fix crash on startup",
  });
  assert.ok(!msg.includes("Resolves #"), "unexpected Resolves trailer");
});

test("buildTaskCommitMessage truncates long descriptions to ~72 chars in subject", () => {
  const longOneLiner = "A".repeat(100);
  const msg = buildTaskCommitMessage({
    taskId: "TASK-1",
    taskTitle: "Add feature",
    oneLiner: longOneLiner,
  });
  const subject = msg.split("\n")[0]!;
  // Subject line should not exceed 72 chars (type + ': ' + truncated description)
  assert.ok(subject.length <= 72, `Subject too long: ${subject.length} chars — "${subject}"`);
});

test("buildTaskCommitMessage falls back to taskTitle when no oneLiner", () => {
  const title = "Add caching layer";
  const msg = buildTaskCommitMessage({
    taskId: "TASK-99",
    taskTitle: title,
  });
  // The subject should contain the title (possibly truncated)
  assert.ok(msg.includes("caching layer"), "expected taskTitle in subject");
});

test("buildTaskCommitMessage uses oneLiner as description when provided", () => {
  const msg = buildTaskCommitMessage({
    taskId: "TASK-5",
    taskTitle: "Add feature",
    oneLiner: "Implement retry-aware worker status logging",
  });
  assert.ok(msg.includes("retry-aware"), "expected oneLiner content in subject");
});

test("buildTaskCommitMessage includes key files in body when provided", () => {
  const msg = buildTaskCommitMessage({
    taskId: "TASK-3",
    taskTitle: "Refactor auth",
    keyFiles: ["src/auth.ts", "src/token.ts"],
  });
  assert.ok(msg.includes("src/auth.ts"), "expected key file in body");
  assert.ok(msg.includes("src/token.ts"), "expected key file in body");
});
