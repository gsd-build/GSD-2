/**
 * worktree-sync-milestones.test.ts — Regression test for #1311.
 *
 * Verifies that syncGsdStateToWorktree copies missing milestones,
 * milestone files, and slice directories from the main repo's .gsd/
 * into the worktree's .gsd/.
 *
 * Covers:
 *   - Entirely missing milestone directory
 *   - Milestone exists but missing CONTEXT/ROADMAP files
 *   - Missing slices within an existing milestone
 *   - No-op when directories are identical (symlinked)
 *   - Root-level files (DECISIONS, REQUIREMENTS, preferences, etc.)
 *   - Missing nested files inside existing slice directories
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, symlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { syncGsdStateToWorktree } from '../auto-worktree.ts';
import { createTestContext } from './test-helpers.ts';

const { assertEq, assertTrue, report } = createTestContext();

function createBase(name: string): string {
  const base = mkdtempSync(join(tmpdir(), `gsd-wt-sync-${name}-`));
  mkdirSync(join(base, '.gsd', 'milestones'), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

async function main(): Promise<void> {

  // ─── 1. Missing milestone directory is synced ─────────────────────────
  console.log('\n=== 1. missing milestone directory is copied from main ===');
  {
    const mainBase = createBase('main');
    const wtBase = createBase('wt');

    try {
      // Main repo has M001 and M002
      const m001Dir = join(mainBase, '.gsd', 'milestones', 'M001');
      mkdirSync(m001Dir, { recursive: true });
      writeFileSync(join(m001Dir, 'M001-CONTEXT.md'), '# M001\nDone.');
      writeFileSync(join(m001Dir, 'M001-ROADMAP.md'), '# Roadmap');

      const m002Dir = join(mainBase, '.gsd', 'milestones', 'M002');
      mkdirSync(m002Dir, { recursive: true });
      writeFileSync(join(m002Dir, 'M002-CONTEXT.md'), '# M002\nNew milestone.');
      writeFileSync(join(m002Dir, 'M002-ROADMAP.md'), '# Roadmap');

      // Worktree only has M001
      const wtM001Dir = join(wtBase, '.gsd', 'milestones', 'M001');
      mkdirSync(wtM001Dir, { recursive: true });
      writeFileSync(join(wtM001Dir, 'M001-CONTEXT.md'), '# M001\nDone.');

      // M002 is missing from worktree
      assertTrue(!existsSync(join(wtBase, '.gsd', 'milestones', 'M002')), 'M002 missing before sync');

      const result = syncGsdStateToWorktree(mainBase, wtBase);

      assertTrue(existsSync(join(wtBase, '.gsd', 'milestones', 'M002')), '#1311: M002 synced to worktree');
      assertTrue(existsSync(join(wtBase, '.gsd', 'milestones', 'M002', 'M002-CONTEXT.md')), 'M002 CONTEXT synced');
      assertTrue(existsSync(join(wtBase, '.gsd', 'milestones', 'M002', 'M002-ROADMAP.md')), 'M002 ROADMAP synced');
      assertTrue(result.synced.length > 0, 'sync reported files');
    } finally {
      cleanup(mainBase);
      cleanup(wtBase);
    }
  }

  // ─── 2. Missing files within existing milestone ───────────────────────
  console.log('\n=== 2. missing files within existing milestone are synced ===');
  {
    const mainBase = createBase('main');
    const wtBase = createBase('wt');

    try {
      // Main repo M001 has CONTEXT, ROADMAP, RESEARCH
      const m001Dir = join(mainBase, '.gsd', 'milestones', 'M001');
      mkdirSync(m001Dir, { recursive: true });
      writeFileSync(join(m001Dir, 'M001-CONTEXT.md'), '# M001 Context');
      writeFileSync(join(m001Dir, 'M001-ROADMAP.md'), '# M001 Roadmap');
      writeFileSync(join(m001Dir, 'M001-RESEARCH.md'), '# M001 Research');

      // Worktree M001 only has CONTEXT (stale snapshot)
      const wtM001Dir = join(wtBase, '.gsd', 'milestones', 'M001');
      mkdirSync(wtM001Dir, { recursive: true });
      writeFileSync(join(wtM001Dir, 'M001-CONTEXT.md'), '# M001 Context');

      const result = syncGsdStateToWorktree(mainBase, wtBase);

      assertTrue(existsSync(join(wtBase, '.gsd', 'milestones', 'M001', 'M001-ROADMAP.md')), 'ROADMAP synced');
      assertTrue(existsSync(join(wtBase, '.gsd', 'milestones', 'M001', 'M001-RESEARCH.md')), 'RESEARCH synced');
      // Existing file should NOT be overwritten
      assertEq(
        readFileSync(join(wtBase, '.gsd', 'milestones', 'M001', 'M001-CONTEXT.md'), 'utf-8'),
        '# M001 Context',
        'existing CONTEXT not overwritten',
      );
    } finally {
      cleanup(mainBase);
      cleanup(wtBase);
    }
  }

  // ─── 3. Missing slices directory synced ───────────────────────────────
  console.log('\n=== 3. missing slices directory synced ===');
  {
    const mainBase = createBase('main');
    const wtBase = createBase('wt');

    try {
      // Main repo has M001 with slices S01–S03
      const m001Dir = join(mainBase, '.gsd', 'milestones', 'M001');
      mkdirSync(join(m001Dir, 'slices', 'S01'), { recursive: true });
      mkdirSync(join(m001Dir, 'slices', 'S02'), { recursive: true });
      mkdirSync(join(m001Dir, 'slices', 'S03'), { recursive: true });
      writeFileSync(join(m001Dir, 'M001-ROADMAP.md'), '# Roadmap');
      writeFileSync(join(m001Dir, 'slices', 'S01', 'S01-PLAN.md'), '# S01 Plan');
      writeFileSync(join(m001Dir, 'slices', 'S02', 'S02-PLAN.md'), '# S02 Plan');
      writeFileSync(join(m001Dir, 'slices', 'S03', 'S03-PLAN.md'), '# S03 Plan');

      // Worktree M001 has slices S01–S02 only (S03 missing)
      const wtM001Dir = join(wtBase, '.gsd', 'milestones', 'M001');
      mkdirSync(join(wtM001Dir, 'slices', 'S01'), { recursive: true });
      mkdirSync(join(wtM001Dir, 'slices', 'S02'), { recursive: true });
      writeFileSync(join(wtM001Dir, 'M001-ROADMAP.md'), '# Roadmap');
      writeFileSync(join(wtM001Dir, 'slices', 'S01', 'S01-PLAN.md'), '# S01 Plan');
      writeFileSync(join(wtM001Dir, 'slices', 'S02', 'S02-PLAN.md'), '# S02 Plan');

      assertTrue(!existsSync(join(wtBase, '.gsd', 'milestones', 'M001', 'slices', 'S03')), 'S03 missing before sync');

      syncGsdStateToWorktree(mainBase, wtBase);

      assertTrue(existsSync(join(wtBase, '.gsd', 'milestones', 'M001', 'slices', 'S03')), '#1311: S03 synced');
      assertTrue(existsSync(join(wtBase, '.gsd', 'milestones', 'M001', 'slices', 'S03', 'S03-PLAN.md')), 'S03 PLAN synced');
    } finally {
      cleanup(mainBase);
      cleanup(wtBase);
    }
  }

  // ─── 4. No-op when both resolve to same directory (symlink) ───────────
  console.log('\n=== 4. no-op when .gsd/ resolves to same path (symlinked) ===');
  {
    const sharedDir = createBase('shared');
    const mainBase = mkdtempSync(join(tmpdir(), 'gsd-wt-sync-main-'));
    const wtBase = mkdtempSync(join(tmpdir(), 'gsd-wt-sync-wt-'));

    try {
      // Both main and worktree symlink to the same shared directory
      writeFileSync(join(sharedDir, '.gsd', 'milestones', 'keep'), '');
      symlinkSync(join(sharedDir, '.gsd'), join(mainBase, '.gsd'));
      symlinkSync(join(sharedDir, '.gsd'), join(wtBase, '.gsd'));

      const result = syncGsdStateToWorktree(mainBase, wtBase);
      assertEq(result.synced.length, 0, 'no files synced when both point to same dir');
    } finally {
      cleanup(sharedDir);
      rmSync(mainBase, { recursive: true, force: true });
      rmSync(wtBase, { recursive: true, force: true });
    }
  }

  // ─── 5. Root-level .gsd/ files synced ─────────────────────────────────
  console.log('\n=== 5. root-level .gsd/ files synced ===');
  {
    const mainBase = createBase('main');
    const wtBase = createBase('wt');

    try {
      writeFileSync(join(mainBase, '.gsd', 'DECISIONS.md'), '# Decisions');
      writeFileSync(join(mainBase, '.gsd', 'REQUIREMENTS.md'), '# Requirements');
      writeFileSync(join(mainBase, '.gsd', 'PROJECT.md'), '# Project');
      writeFileSync(join(mainBase, '.gsd', 'preferences.md'), '---\nversion: 1\n---\n');

      // Worktree has none of these
      const result = syncGsdStateToWorktree(mainBase, wtBase);

      assertTrue(existsSync(join(wtBase, '.gsd', 'DECISIONS.md')), 'DECISIONS.md synced');
      assertTrue(existsSync(join(wtBase, '.gsd', 'REQUIREMENTS.md')), 'REQUIREMENTS.md synced');
      assertTrue(existsSync(join(wtBase, '.gsd', 'PROJECT.md')), 'PROJECT.md synced');
      assertTrue(existsSync(join(wtBase, '.gsd', 'preferences.md')), 'preferences.md synced');
      assertTrue(result.synced.length >= 4, 'at least 4 files synced');
    } finally {
      cleanup(mainBase);
      cleanup(wtBase);
    }
  }

  // ─── 6. Existing slice directories receive missing nested files ───────
  console.log('\n=== 6. existing slice directories receive missing nested files ===');
  {
    const mainBase = createBase('main');
    const wtBase = createBase('wt');

    try {
      const mainTasksDir = join(mainBase, '.gsd', 'milestones', 'M001', 'slices', 'S01', 'tasks');
      mkdirSync(mainTasksDir, { recursive: true });
      writeFileSync(join(mainBase, '.gsd', 'milestones', 'M001', 'M001-ROADMAP.md'), '# Roadmap');
      writeFileSync(join(mainBase, '.gsd', 'milestones', 'M001', 'slices', 'S01', 'S01-PLAN.md'), '# Slice plan');
      writeFileSync(join(mainTasksDir, 'T01-PLAN.md'), '# Task plan');

      const wtTasksDir = join(wtBase, '.gsd', 'milestones', 'M001', 'slices', 'S01', 'tasks');
      mkdirSync(wtTasksDir, { recursive: true });
      writeFileSync(join(wtBase, '.gsd', 'milestones', 'M001', 'M001-ROADMAP.md'), '# Roadmap');
      writeFileSync(join(wtBase, '.gsd', 'milestones', 'M001', 'slices', 'S01', 'S01-PLAN.md'), '# Slice plan');

      assertTrue(!existsSync(join(wtTasksDir, 'T01-PLAN.md')), 'nested task file missing before sync');

      const result = syncGsdStateToWorktree(mainBase, wtBase);

      assertTrue(existsSync(join(wtTasksDir, 'T01-PLAN.md')), 'nested task file synced into existing slice dir');
      assertTrue(
        result.synced.includes('milestones/M001/slices/S01/tasks/T01-PLAN.md'),
        'sync reports nested task file',
      );
    } finally {
      cleanup(mainBase);
      cleanup(wtBase);
    }
  }

  // ─── 7. Non-existent directories handled gracefully ───────────────────
  console.log('\n=== 7. non-existent directories → no-op ===');
  {
    const result = syncGsdStateToWorktree('/tmp/does-not-exist-main', '/tmp/does-not-exist-wt');
    assertEq(result.synced.length, 0, 'no crash on missing directories');
  }

  report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
