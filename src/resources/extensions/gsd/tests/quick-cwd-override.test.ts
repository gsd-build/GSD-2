/**
 * Tests for quick-task CWD override: #2266
 *
 * When `/gsd quick` is invoked after auto-mode exits a worktree, the quick-task
 * prompt must explicitly set the working directory to the project root so the
 * agent doesn't follow a stale worktree path from the prior system context.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

function run(command: string, cwd: string): string {
  return execSync(command, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

function createTestRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "gsd-quick-cwd-"));
  run("git init -b main", repo);
  run(`git config user.name "GSD Test"`, repo);
  run(`git config user.email "test@gsd.dev"`, repo);
  mkdirSync(join(repo, ".gsd", "runtime"), { recursive: true });
  mkdirSync(join(repo, ".gsd", "quick"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "init\n");
  run("git add -A", repo);
  run(`git commit -m "init"`, repo);
  return repo;
}

// ─── Test: quick-task prompt includes explicit working directory ──────────────

test("handleQuick prompt includes explicit working directory override", async () => {
  const repo = createTestRepo();
  const origCwd = process.cwd();

  try {
    process.chdir(repo);

    // Capture what sendMessage receives
    let capturedMessage: { customType: string; content: string; display: boolean } | null = null;

    const mockPi = {
      sendMessage(
        message: { customType: string; content: string; display: boolean },
        _options?: unknown,
      ): void {
        capturedMessage = message;
      },
    };

    const mockCtx = {
      ui: {
        notify(_msg: string, _level: string): void { /* no-op */ },
      },
    };

    const { handleQuick } = await import("../quick.ts");
    await handleQuick("fix the login button", mockCtx as any, mockPi as any);

    assert.ok(capturedMessage, "sendMessage was called");
    assert.equal(capturedMessage!.customType, "gsd-quick-task");

    // The prompt content MUST include an explicit working directory directive
    // pointing to the project root (process.cwd()), so the agent doesn't follow
    // a stale worktree path from prior auto-mode context.
    const content = capturedMessage!.content;
    assert.ok(
      content.includes(repo),
      `Prompt must include the project root path (${repo}), got:\n${content.slice(0, 500)}`,
    );
    assert.match(
      content,
      /working\s+directory/i,
      "Prompt must include a 'working directory' directive",
    );
  } finally {
    process.chdir(origCwd);
    rmSync(repo, { recursive: true, force: true });
  }
});

// ─── Test: working directory in prompt matches process.cwd(), not worktree ────

test("handleQuick prompt uses project root CWD, not stale worktree path", async () => {
  const repo = createTestRepo();
  const origCwd = process.cwd();

  // Create a fake worktree directory to simulate the scenario
  const worktreeDir = join(repo, ".gsd", "worktrees", "M003");
  mkdirSync(worktreeDir, { recursive: true });

  try {
    // Simulate: process.cwd() is project root (stopAuto already restored it)
    process.chdir(repo);

    let capturedContent = "";
    const mockPi = {
      sendMessage(
        message: { customType: string; content: string; display: boolean },
        _options?: unknown,
      ): void {
        capturedContent = message.content;
      },
    };

    const mockCtx = {
      ui: {
        notify(_msg: string, _level: string): void { /* no-op */ },
      },
    };

    const { handleQuick } = await import("../quick.ts");
    await handleQuick("add unit tests", mockCtx as any, mockPi as any);

    // The prompt should reference the project root, NOT the worktree path
    assert.ok(
      capturedContent.includes(repo),
      `Prompt should include project root (${repo})`,
    );
    assert.ok(
      !capturedContent.includes(worktreeDir),
      `Prompt must NOT include worktree path (${worktreeDir})`,
    );

    // Verify the working directory directive explicitly overrides prior context
    assert.match(
      capturedContent,
      /ignore.*prior|override|ALL file operations/i,
      "Prompt should include language that overrides any prior working directory instructions",
    );
  } finally {
    process.chdir(origCwd);
    rmSync(repo, { recursive: true, force: true });
  }
});
