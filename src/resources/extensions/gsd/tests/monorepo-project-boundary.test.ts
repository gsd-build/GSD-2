import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

import { ensureGsdSymlink, isInheritedRepo, repoIdentity } from "../repo-identity.ts";
import { gsdRoot, _clearGsdRootCache } from "../paths.ts";
import { resolveProjectRoot } from "../worktree.ts";

function run(command: string, cwd: string): string {
  return execSync(command, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

function initRepo(): string {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "gsd-monorepo-boundary-")));
  run("git init -b main", repo);
  run('git config user.name "Pi Test"', repo);
  run('git config user.email "pi@example.com"', repo);
  run("git remote add origin git@github.com:example/monorepo.git", repo);
  writeFileSync(join(repo, "README.md"), "# Monorepo\n", "utf-8");
  run("git add README.md", repo);
  run('git commit -m "chore: init"', repo);
  return repo;
}

function writeProjectGsd(projectRoot: string, title: string): void {
  mkdirSync(join(projectRoot, ".gsd"), { recursive: true });
  writeFileSync(join(projectRoot, ".gsd", "PROJECT.md"), `# ${title}\n`, "utf-8");
}

describe("monorepo project-local .gsd boundaries", () => {
  const cleanup: string[] = [];

  afterEach(() => {
    _clearGsdRootCache();
    for (const dir of cleanup.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
    delete process.env.GSD_PROJECT_ID;
    delete process.env.GSD_STATE_DIR;
  });

  test("gsdRoot prefers the nearest explicit subproject .gsd over the git root .gsd", () => {
    const repo = initRepo();
    cleanup.push(repo);
    writeProjectGsd(repo, "Root Project");

    const child = join(repo, "candidates", "autonomy-video-studio");
    const childSrc = join(child, "src");
    mkdirSync(childSrc, { recursive: true });
    writeProjectGsd(child, "Autonomy Video Studio");

    assert.equal(gsdRoot(childSrc), join(child, ".gsd"));
    assert.equal(resolveProjectRoot(childSrc), child);
  });

  test("subdirectories without an explicit .gsd still fall back to the git root .gsd", () => {
    const repo = initRepo();
    cleanup.push(repo);
    writeProjectGsd(repo, "Root Project");

    const childSrc = join(repo, "packages", "tool", "src");
    mkdirSync(childSrc, { recursive: true });

    assert.equal(gsdRoot(childSrc), join(repo, ".gsd"));
    assert.equal(resolveProjectRoot(childSrc), repo);
  });

  test("project-local .gsd prevents inherited-repo detection and nested git init pressure", () => {
    const repo = initRepo();
    cleanup.push(repo);

    const child = join(repo, "candidates", "video-studio");
    mkdirSync(child, { recursive: true });
    assert.equal(isInheritedRepo(child), true);

    writeProjectGsd(child, "Video Studio");
    assert.equal(isInheritedRepo(child), false);
  });

  test("subproject identity is distinct from the parent repo identity without nested git", () => {
    const repo = initRepo();
    cleanup.push(repo);
    writeProjectGsd(repo, "Root Project");

    const child = join(repo, "candidates", "autonomy-video-studio");
    mkdirSync(child, { recursive: true });
    writeProjectGsd(child, "Autonomy Video Studio");

    assert.notEqual(repoIdentity(child), repoIdentity(repo));
    assert.match(repoIdentity(child), /^[0-9a-f]{12}$/);
    assert.ok(!existsSync(join(child, ".git")), "subproject does not need a nested .git directory");
  });

  test("ensureGsdSymlink preserves an explicit subproject .gsd when the git root also has .gsd", () => {
    const repo = initRepo();
    const stateDir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-monorepo-state-")));
    cleanup.push(repo, stateDir);
    process.env.GSD_STATE_DIR = stateDir;

    ensureGsdSymlink(repo);
    assert.ok(lstatSync(join(repo, ".gsd")).isSymbolicLink(), "repo root uses external state symlink");

    const child = join(repo, "candidates", "autonomy-video-studio");
    mkdirSync(child, { recursive: true });
    writeProjectGsd(child, "Autonomy Video Studio");

    const result = ensureGsdSymlink(child);
    assert.equal(result, join(child, ".gsd"));
    assert.ok(lstatSync(join(child, ".gsd")).isDirectory(), "explicit subproject .gsd stays local");
  });
});
