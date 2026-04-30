import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { resolveProjectRoot } from "../worktree.ts";

function makeParentRepo(): string {
  const parent = join(tmpdir(), `gsd-root-resolution-${randomUUID()}`);
  mkdirSync(parent, { recursive: true });
  execFileSync("git", ["init"], { cwd: parent, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: parent });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: parent });
  return parent;
}

test("resolveProjectRoot prefers nearest bootstrapped .gsd before parent git root", () => {
  const parent = makeParentRepo();
  const child = join(parent, "nested-app");
  const nested = join(child, "src", "components");

  try {
    mkdirSync(join(parent, ".gsd", "milestones"), { recursive: true });
    mkdirSync(join(child, ".gsd"), { recursive: true });
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(child, ".gsd", "PREFERENCES.md"), "---\nplanning_depth: deep\n---\n");

    assert.equal(resolveProjectRoot(child), child);
    assert.equal(resolveProjectRoot(nested), child);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("resolveProjectRoot ignores zombie .gsd without bootstrap artifacts", () => {
  const parent = makeParentRepo();
  const child = join(parent, "nested-app");

  try {
    mkdirSync(join(parent, ".gsd", "milestones"), { recursive: true });
    mkdirSync(join(child, ".gsd"), { recursive: true });

    assert.equal(resolveProjectRoot(child), parent);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
