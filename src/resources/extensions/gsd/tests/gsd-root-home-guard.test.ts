/**
 * GSD2 — regression tests for #5187 and git-root anchor guard:
 *
 * #5187: gsdRoot() must refuse to use the global GSD home (~/.gsd) as a
 * project .gsd directory when basePath resolves to $HOME. Paths under
 * ~/.gsd/projects/<hash>/ remain valid.
 *
 * git-root anchor guard: when $HOME is itself a git repo and ~/.gsd exists,
 * gsdRoot() must NOT return ~/.gsd for a subdir basePath like ~/projects/foo.
 * It should fall through to step 4 (creation fallback) instead.
 */

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { gsdRoot, _clearGsdRootCache } from '../paths.ts';

describe('gsdRoot() refuses ~/.gsd as project state when basePath is $HOME (#5187)', () => {
  let fakeHome: string;
  let savedHome: string | undefined;
  let savedUserProfile: string | undefined;
  let savedGsdHome: string | undefined;

  beforeEach(() => {
    fakeHome = realpathSync(mkdtempSync(join(tmpdir(), 'gsd-home-guard-')));
    mkdirSync(join(fakeHome, '.gsd'), { recursive: true });

    savedHome = process.env.HOME;
    savedUserProfile = process.env.USERPROFILE;
    savedGsdHome = process.env.GSD_HOME;

    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    delete process.env.GSD_HOME;

    _clearGsdRootCache();
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserProfile;
    if (savedGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = savedGsdHome;

    _clearGsdRootCache();
    rmSync(fakeHome, { recursive: true, force: true });
  });

  test('throws when basePath is the home directory and result equals gsdHome()', () => {
    assert.throws(
      () => gsdRoot(fakeHome),
      (err: unknown) => {
        assert.ok(err instanceof Error, 'should throw an Error');
        assert.match(
          (err as Error).message,
          /global GSD home|project .gsd directory/i,
          'message should explain the refusal',
        );
        return true;
      },
    );
  });

  test('does NOT throw for paths under ~/.gsd/projects/<hash>/', () => {
    const projectStateDir = join(fakeHome, '.gsd', 'projects', 'abcdef123456');
    mkdirSync(join(projectStateDir, '.gsd'), { recursive: true });
    _clearGsdRootCache();

    const resolved = gsdRoot(projectStateDir);
    assert.equal(resolved, join(projectStateDir, '.gsd'));
  });

  test('does NOT throw for an unrelated project directory that has its own .gsd', () => {
    const projectDir = realpathSync(mkdtempSync(join(tmpdir(), 'gsd-home-guard-proj-')));
    mkdirSync(join(projectDir, '.gsd'), { recursive: true });
    _clearGsdRootCache();
    try {
      const resolved = gsdRoot(projectDir);
      assert.equal(resolved, join(projectDir, '.gsd'));
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

describe('git-root anchor guard: subdir basePath must not resolve to ~/.gsd', () => {
  let fakeHome: string;
  let subDir: string;
  let savedHome: string | undefined;
  let savedUserProfile: string | undefined;
  let savedGsdHome: string | undefined;

  beforeEach(() => {
    // Create a tmpdir that will act as both $HOME and a git repo root.
    fakeHome = realpathSync(mkdtempSync(join(tmpdir(), 'gsd-anchor-guard-')));
    // Init a bare-minimum git repo so git rev-parse --show-toplevel returns fakeHome.
    spawnSync('git', ['init', fakeHome], { encoding: 'utf-8' });
    // Create ~/.gsd (the global home that must NOT be used for project subdirs).
    mkdirSync(join(fakeHome, '.gsd'), { recursive: true });
    // Create a subdir inside the git repo — this is the project basePath.
    subDir = join(fakeHome, 'projects', 'foo');
    mkdirSync(subDir, { recursive: true });

    savedHome = process.env.HOME;
    savedUserProfile = process.env.USERPROFILE;
    savedGsdHome = process.env.GSD_HOME;

    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    delete process.env.GSD_HOME;

    _clearGsdRootCache();
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserProfile;
    if (savedGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = savedGsdHome;

    _clearGsdRootCache();
    rmSync(fakeHome, { recursive: true, force: true });
  });

  test('does NOT return ~/.gsd when $HOME is a git repo and basePath is a subdir', () => {
    // fakeHome IS the git root AND $HOME, so git rev-parse returns fakeHome,
    // and ~/.gsd (fakeHome/.gsd) exists. The guard must skip that candidate
    // and fall through to the creation fallback: subDir/.gsd.
    const result = gsdRoot(subDir);
    assert.notEqual(
      result,
      join(fakeHome, '.gsd'),
      'gsdRoot must not return ~/.gsd for a subdir basePath',
    );
    assert.equal(
      result,
      join(subDir, '.gsd'),
      'gsdRoot should fall through to the creation fallback for a subdir',
    );
  });
});
