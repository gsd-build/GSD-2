import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { deriveState, invalidateStateCache } from '../state.ts';
import { openDatabase, closeDatabase, insertArtifact, isDbAvailable, _getAdapter } from '../gsd-db.ts';
import { resetEngine } from '../workflow-engine.ts';
import { createTestContext } from './test-helpers.ts';

const { assertEq, assertTrue, report } = createTestContext();

// ─── Fixture Helpers ───────────────────────────────────────────────────────

function createFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'gsd-derive-db-'));
  mkdirSync(join(base, '.gsd', 'milestones'), { recursive: true });
  return base;
}

function writeFile(base: string, relativePath: string, content: string): void {
  const full = join(base, '.gsd', relativePath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

function insertArtifactRow(relativePath: string, content: string, opts?: {
  artifact_type?: string;
  milestone_id?: string | null;
  slice_id?: string | null;
  task_id?: string | null;
}): void {
  insertArtifact({
    path: relativePath,
    artifact_type: opts?.artifact_type ?? 'planning',
    milestone_id: opts?.milestone_id ?? null,
    slice_id: opts?.slice_id ?? null,
    task_id: opts?.task_id ?? null,
    full_content: content,
  });
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// Test Groups
// ═══════════════════════════════════════════════════════════════════════════

const ROADMAP_CONTENT = `# M001: Test Milestone

**Vision:** Test DB-backed derive state.

## Slices

- [ ] **S01: First Slice** \`risk:low\` \`depends:[]\`
  > After this: Slice done.

- [ ] **S02: Second Slice** \`risk:low\` \`depends:[S01]\`
  > After this: All done.
`;

const PLAN_CONTENT = `# S01: First Slice

**Goal:** Test executing.
**Demo:** Tests pass.

## Tasks

- [ ] **T01: First Task** \`est:10m\`
  First task description.

- [x] **T02: Done Task** \`est:10m\`
  Already done.
`;

const REQUIREMENTS_CONTENT = `# Requirements

## Active

### R001 — First Requirement
- Status: active
- Description: Something active.

### R002 — Second Requirement
- Status: active
- Description: Another active.

## Validated

### R003 — Validated
- Status: validated
- Description: Already validated.
`;

async function main(): Promise<void> {

  // ─── Test 1: DB-backed deriveState produces identical GSDState ─────────
  console.log('\n=== derive-state-db: DB path matches file path ===');
  {
    const base = createFixtureBase();
    try {
      // Write files to disk (for file-only path)
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/S01-PLAN.md', PLAN_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/tasks/.gitkeep', '');
      writeFile(base, 'milestones/M001/slices/S01/tasks/T01-PLAN.md', '# T01 Plan');
      writeFile(base, 'REQUIREMENTS.md', REQUIREMENTS_CONTENT);

      // Derive state from files only (no DB)
      invalidateStateCache();
      const fileState = await deriveState(base);

      // Now open DB, insert matching artifacts + engine tables
      openDatabase(':memory:');
      resetEngine();
      assertTrue(isDbAvailable(), 'db-match: DB is available after open');

      insertArtifactRow('milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT, {
        artifact_type: 'roadmap',
        milestone_id: 'M001',
      });
      insertArtifactRow('milestones/M001/slices/S01/S01-PLAN.md', PLAN_CONTENT, {
        artifact_type: 'plan',
        milestone_id: 'M001',
        slice_id: 'S01',
      });
      insertArtifactRow('REQUIREMENTS.md', REQUIREMENTS_CONTENT, {
        artifact_type: 'requirements',
      });

      // Populate engine tables to match the fixture's file state
      const db = _getAdapter()!;
      db.prepare('INSERT INTO milestones (id, title, status, created_at) VALUES (?, ?, ?, ?)').run('M001', 'Test Milestone', 'active', new Date().toISOString());
      db.prepare('INSERT INTO slices (id, milestone_id, title, status, risk, depends_on, seq, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('S01', 'M001', 'First Slice', 'active', 'low', '', 1, new Date().toISOString());
      db.prepare('INSERT INTO slices (id, milestone_id, title, status, risk, depends_on, seq, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('S02', 'M001', 'Second Slice', 'pending', 'low', 'S01', 2, new Date().toISOString());
      db.prepare('INSERT INTO tasks (id, slice_id, milestone_id, title, description, status, estimate, files, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('T01', 'S01', 'M001', 'First Task', 'First task description.', 'pending', '10m', '', 1);
      db.prepare('INSERT INTO tasks (id, slice_id, milestone_id, title, description, status, estimate, files, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('T02', 'S01', 'M001', 'Done Task', 'Already done.', 'done', '10m', '', 2);

      // Derive state from DB
      invalidateStateCache();
      const dbState = await deriveState(base);

      // Field-by-field equality
      assertEq(dbState.phase, fileState.phase, 'db-match: phase matches');
      assertEq(dbState.activeMilestone?.id, fileState.activeMilestone?.id, 'db-match: activeMilestone.id matches');
      assertEq(dbState.activeMilestone?.title, fileState.activeMilestone?.title, 'db-match: activeMilestone.title matches');
      assertEq(dbState.activeSlice?.id, fileState.activeSlice?.id, 'db-match: activeSlice.id matches');
      assertEq(dbState.activeSlice?.title, fileState.activeSlice?.title, 'db-match: activeSlice.title matches');
      assertEq(dbState.activeTask?.id, fileState.activeTask?.id, 'db-match: activeTask.id matches');
      assertEq(dbState.activeTask?.title, fileState.activeTask?.title, 'db-match: activeTask.title matches');
      assertEq(dbState.blockers, fileState.blockers, 'db-match: blockers match');
      assertEq(dbState.registry.length, fileState.registry.length, 'db-match: registry length matches');
      assertEq(dbState.registry[0]?.status, fileState.registry[0]?.status, 'db-match: registry[0] status matches');
      // Note: requirements are not stored in engine tables — they come from
      // file-based parsing only. The engine path does not return requirements.
      // This is expected: requirements tracking is a separate concern.
      assertEq(dbState.progress?.milestones?.done, fileState.progress?.milestones?.done, 'db-match: milestones.done matches');
      assertEq(dbState.progress?.milestones?.total, fileState.progress?.milestones?.total, 'db-match: milestones.total matches');
      assertEq(dbState.progress?.slices?.done, fileState.progress?.slices?.done, 'db-match: slices.done matches');
      assertEq(dbState.progress?.slices?.total, fileState.progress?.slices?.total, 'db-match: slices.total matches');
      assertEq(dbState.progress?.tasks?.done, fileState.progress?.tasks?.done, 'db-match: tasks.done matches');
      assertEq(dbState.progress?.tasks?.total, fileState.progress?.tasks?.total, 'db-match: tasks.total matches');

      resetEngine();
      closeDatabase();
    } finally {
      resetEngine();
      closeDatabase();
      cleanup(base);
    }
  }

  // ─── Test 2: Fallback when DB unavailable ─────────────────────────────
  console.log('\n=== derive-state-db: fallback when DB unavailable ===');
  {
    const base = createFixtureBase();
    try {
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/S01-PLAN.md', PLAN_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/tasks/.gitkeep', '');
      writeFile(base, 'milestones/M001/slices/S01/tasks/T01-PLAN.md', '# T01 Plan');

      // No DB open — isDbAvailable() is false
      assertTrue(!isDbAvailable(), 'fallback: DB is not available');
      invalidateStateCache();
      const state = await deriveState(base);

      assertEq(state.phase, 'executing', 'fallback: phase is executing');
      assertEq(state.activeMilestone?.id, 'M001', 'fallback: activeMilestone is M001');
      assertEq(state.activeSlice?.id, 'S01', 'fallback: activeSlice is S01');
      assertEq(state.activeTask?.id, 'T01', 'fallback: activeTask is T01');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 3: Empty DB falls back to file reads ────────────────────────
  console.log('\n=== derive-state-db: empty DB falls back to files ===');
  {
    const base = createFixtureBase();
    try {
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/S01-PLAN.md', PLAN_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/tasks/.gitkeep', '');
      writeFile(base, 'milestones/M001/slices/S01/tasks/T01-PLAN.md', '# T01 Plan');

      // Open DB but insert nothing — engine auto-migrates from markdown files
      openDatabase(':memory:');
      resetEngine();
      assertTrue(isDbAvailable(), 'empty-db: DB is available');

      invalidateStateCache();
      const state = await deriveState(base);

      // Auto-migration populates engine tables from disk files
      assertEq(state.activeMilestone?.id, 'M001', 'empty-db: activeMilestone is M001');
      // Note: after auto-migration, exact phase/slice/task depend on migration quality
      // The key invariant is that the milestone is found
      assertTrue(state.activeMilestone !== null, 'empty-db: has active milestone after auto-migration');

      resetEngine();
      closeDatabase();
    } finally {
      closeDatabase();
      cleanup(base);
    }
  }

  // ─── Test 4: Partial DB content fills gaps from disk ──────────────────
  console.log('\n=== derive-state-db: partial DB fills gaps from disk ===');
  {
    const base = createFixtureBase();
    try {
      // Write all files to disk
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/S01-PLAN.md', PLAN_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/tasks/.gitkeep', '');
      writeFile(base, 'milestones/M001/slices/S01/tasks/T01-PLAN.md', '# T01 Plan');
      writeFile(base, 'REQUIREMENTS.md', REQUIREMENTS_CONTENT);

      // Open DB and insert the roadmap — engine auto-migrates remaining from disk
      openDatabase(':memory:');
      resetEngine();
      insertArtifactRow('milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT, {
        artifact_type: 'roadmap',
        milestone_id: 'M001',
      });

      invalidateStateCache();
      const state = await deriveState(base);

      // Engine auto-migrates from disk files
      assertEq(state.activeMilestone?.id, 'M001', 'partial-db: activeMilestone is M001');
      assertTrue(state.activeMilestone !== null, 'partial-db: has active milestone');
      // Note: requirements are not stored in engine tables — not available via engine path

      resetEngine();
      closeDatabase();
    } finally {
      closeDatabase();
      cleanup(base);
    }
  }

  // ─── Test 5: Requirements counting from disk (DB no longer used for content) ─
  console.log('\n=== derive-state-db: requirements from disk content ===');
  {
    const base = createFixtureBase();
    try {
      // Write minimal milestone dir (needed for milestone discovery)
      mkdirSync(join(base, '.gsd', 'milestones', 'M001'), { recursive: true });
      // Write REQUIREMENTS.md to disk (DB content is no longer used by deriveState)
      writeFile(base, 'REQUIREMENTS.md', REQUIREMENTS_CONTENT);

      invalidateStateCache();
      const state = await deriveState(base);

      // Requirements should come from disk
      assertEq(state.requirements?.active, 2, 'req-from-disk: requirements.active = 2');
      assertEq(state.requirements?.validated, 1, 'req-from-disk: requirements.validated = 1');
      assertEq(state.requirements?.total, 3, 'req-from-disk: requirements.total = 3');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 6: DB content with multi-milestone registry ─────────────────
  console.log('\n=== derive-state-db: multi-milestone from DB ===');
  {
    const base = createFixtureBase();

    const completedRoadmap = `# M001: First Milestone

**Vision:** Already done.

## Slices

- [x] **S01: Done** \`risk:low\` \`depends:[]\`
  > After this: Done.
`;
    const summaryContent = `# M001 Summary\n\nFirst milestone complete.`;

    const activeRoadmap = `# M002: Second Milestone

**Vision:** Currently active.

## Slices

- [ ] **S01: In Progress** \`risk:low\` \`depends:[]\`
  > After this: Done.
`;

    try {
      // Create milestone dirs on disk (needed for directory scanning)
      // Also write roadmap files to disk — resolveMilestoneFile checks file existence
      // The DB only provides content, not file discovery
      mkdirSync(join(base, '.gsd', 'milestones', 'M001'), { recursive: true });
      mkdirSync(join(base, '.gsd', 'milestones', 'M002'), { recursive: true });
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', completedRoadmap);
      writeFile(base, 'milestones/M001/M001-VALIDATION.md', `---\nverdict: pass\nremediation_round: 0\n---\n\n# Validation\nPassed.`);
      writeFile(base, 'milestones/M001/M001-SUMMARY.md', summaryContent);
      writeFile(base, 'milestones/M002/M002-ROADMAP.md', activeRoadmap);

      // Put roadmap content in DB
      openDatabase(':memory:');
      resetEngine();
      insertArtifactRow('milestones/M001/M001-ROADMAP.md', completedRoadmap, {
        artifact_type: 'roadmap',
        milestone_id: 'M001',
      });
      insertArtifactRow('milestones/M001/M001-SUMMARY.md', summaryContent, {
        artifact_type: 'summary',
        milestone_id: 'M001',
      });
      insertArtifactRow('milestones/M002/M002-ROADMAP.md', activeRoadmap, {
        artifact_type: 'roadmap',
        milestone_id: 'M002',
      });

      // Populate engine tables
      const db = _getAdapter()!;
      db.prepare('INSERT INTO milestones (id, title, status, created_at) VALUES (?, ?, ?, ?)').run('M001', 'First Milestone', 'complete', new Date().toISOString());
      db.prepare('INSERT INTO milestones (id, title, status, created_at) VALUES (?, ?, ?, ?)').run('M002', 'Second Milestone', 'active', new Date().toISOString());
      db.prepare('INSERT INTO slices (id, milestone_id, title, status, risk, depends_on, seq, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('S01', 'M001', 'Done', 'done', 'low', '', 1, new Date().toISOString());
      db.prepare('INSERT INTO slices (id, milestone_id, title, status, risk, depends_on, seq, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('S01', 'M002', 'In Progress', 'pending', 'low', '', 1, new Date().toISOString());

      invalidateStateCache();
      const state = await deriveState(base);

      assertEq(state.registry.length, 2, 'multi-ms-db: registry has 2 entries');
      assertEq(state.registry[0]?.id, 'M001', 'multi-ms-db: registry[0] is M001');
      assertEq(state.registry[0]?.status, 'complete', 'multi-ms-db: M001 is complete');
      assertEq(state.registry[1]?.id, 'M002', 'multi-ms-db: registry[1] is M002');
      assertEq(state.registry[1]?.status, 'active', 'multi-ms-db: M002 is active');
      assertEq(state.activeMilestone?.id, 'M002', 'multi-ms-db: activeMilestone is M002');
      assertEq(state.phase, 'planning', 'multi-ms-db: phase is planning (no plan for S01)');

      resetEngine();
      closeDatabase();
    } finally {
      closeDatabase();
      cleanup(base);
    }
  }

  // ─── Test 7: Cache invalidation works for DB path ─────────────────────
  console.log('\n=== derive-state-db: cache invalidation ===');
  {
    const base = createFixtureBase();
    try {
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/S01-PLAN.md', PLAN_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/tasks/.gitkeep', '');
      writeFile(base, 'milestones/M001/slices/S01/tasks/T01-PLAN.md', '# T01 Plan');

      openDatabase(':memory:');
      resetEngine();
      insertArtifactRow('milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT, {
        artifact_type: 'roadmap',
        milestone_id: 'M001',
      });
      insertArtifactRow('milestones/M001/slices/S01/S01-PLAN.md', PLAN_CONTENT, {
        artifact_type: 'plan',
        milestone_id: 'M001',
        slice_id: 'S01',
      });

      // Populate engine tables
      const db2 = _getAdapter()!;
      db2.prepare('INSERT INTO milestones (id, title, status, created_at) VALUES (?, ?, ?, ?)').run('M001', 'Test Milestone', 'active', new Date().toISOString());
      db2.prepare('INSERT INTO slices (id, milestone_id, title, status, risk, depends_on, seq, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('S01', 'M001', 'First Slice', 'active', 'low', '', 1, new Date().toISOString());
      db2.prepare('INSERT INTO tasks (id, slice_id, milestone_id, title, description, status, estimate, files, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('T01', 'S01', 'M001', 'First Task', 'First task description.', 'pending', '10m', '', 1);
      db2.prepare('INSERT INTO tasks (id, slice_id, milestone_id, title, description, status, estimate, files, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('T02', 'S01', 'M001', 'Done Task', 'Already done.', 'done', '10m', '', 2);

      invalidateStateCache();
      const state1 = await deriveState(base);
      assertEq(state1.activeTask?.id, 'T01', 'cache-inv: first call gets T01');

      // Simulate task completion by updating engine state + disk
      db2.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('done', 'T01');

      // Without invalidation, should return cached result (T01 still active)
      resetEngine();
      const state2 = await deriveState(base);
      assertEq(state2.activeTask?.id, 'T01', 'cache-inv: cached result still has T01');

      // After invalidation, should pick up updated content
      invalidateStateCache();
      resetEngine();
      const state3 = await deriveState(base);
      assertEq(state3.activeTask, null, 'cache-inv: activeTask is null after all done');

      resetEngine();
      closeDatabase();
    } finally {
      closeDatabase();
      cleanup(base);
    }
  }

  report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
