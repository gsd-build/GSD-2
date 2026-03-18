import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { deriveState } from '../state.js';

let passed = 0;
let failed = 0;

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ─── Fixture Helpers ───────────────────────────────────────────────────────

function createFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'gsd-draft-test-'));
  mkdirSync(join(base, '.gsd', 'milestones'), { recursive: true });
  return base;
}

function writeContextDraft(base: string, mid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-CONTEXT-DRAFT.md`), content);
}

function writeContext(base: string, mid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-CONTEXT.md`), content);
}

function writeRoadmap(base: string, mid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-ROADMAP.md`), content);
}

function writePlan(base: string, mid: string, sid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid, 'slices', sid);
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  writeFileSync(join(dir, "tasks", "T01-PLAN.md"), "# T01 Plan\n");
  writeFileSync(join(dir, `${sid}-PLAN.md`), content);
}

function writeMilestoneSummary(base: string, mid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-SUMMARY.md`), content);
}

function writeMilestoneValidation(base: string, mid: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-VALIDATION.md`), `---\nverdict: pass\nremediation_round: 0\n---\n\n# Validation\nPassed.`);
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// Test Groups
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {

  // ─── Test 1: CONTEXT-DRAFT.md only → needs-discussion ──────────────────
  console.log('\n=== CONTEXT-DRAFT.md only → needs-discussion ===');
  {
    const base = createFixtureBase();
    try {
      // M001 directory with only CONTEXT-DRAFT.md — no CONTEXT.md, no ROADMAP.md
      writeContextDraft(base, 'M001', '# Draft Context\n\nSeed discussion material.');

      const state = await deriveState(base);

      assertEq(state.phase, 'needs-discussion', 'phase is needs-discussion');
      assertEq(state.activeMilestone?.id, 'M001', 'activeMilestone id is M001');
      assertEq(state.activeSlice, null, 'activeSlice is null');
      assertEq(state.activeTask, null, 'activeTask is null');
      assertEq(state.registry[0]?.status, 'active', 'registry[0] status is active');
      assertEq(
        state.nextAction.includes('Discuss'),
        true,
        'nextAction mentions Discuss'
      );
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 2: CONTEXT.md only → pre-planning (unchanged) ───────────────
  console.log('\n=== CONTEXT.md only → pre-planning (unchanged) ===');
  {
    const base = createFixtureBase();
    try {
      // M001 directory with CONTEXT.md but no ROADMAP.md
      writeContext(base, 'M001', '---\ntitle: Full Context\n---\n\n# Full Context\n\nReady for planning.');

      const state = await deriveState(base);

      assertEq(state.phase, 'pre-planning', 'phase is pre-planning with CONTEXT.md');
      assertEq(state.activeMilestone?.id, 'M001', 'activeMilestone id is M001');
      assertEq(state.activeSlice, null, 'activeSlice is null');
      assertEq(state.activeTask, null, 'activeTask is null');
      assertEq(state.registry[0]?.status, 'active', 'registry[0] status is active');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 3: Both CONTEXT.md and CONTEXT-DRAFT.md → CONTEXT wins ──────
  console.log('\n=== both CONTEXT.md and CONTEXT-DRAFT.md → CONTEXT wins ===');
  {
    const base = createFixtureBase();
    try {
      // M001 has both files — CONTEXT.md should take precedence
      writeContext(base, 'M001', '---\ntitle: Full Context\n---\n\n# Full Context\n\nReady.');
      writeContextDraft(base, 'M001', '# Draft\n\nThis should be ignored.');

      const state = await deriveState(base);

      assertEq(state.phase, 'pre-planning', 'phase is pre-planning when CONTEXT.md exists');
      assertEq(state.activeMilestone?.id, 'M001', 'activeMilestone id is M001');
      assertEq(state.registry[0]?.status, 'active', 'registry[0] status is active');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 4: M001 complete, M002 has CONTEXT-DRAFT → M002 needs-discussion ──
  console.log('\n=== M001 complete, M002 has CONTEXT-DRAFT → M002 needs-discussion ===');
  {
    const base = createFixtureBase();
    try {
      // M001: complete (roadmap with all slices done + summary)
      writeRoadmap(base, 'M001', `# M001: First Milestone

**Vision:** Already done.

## Slices

- [x] **S01: Done** \`risk:low\` \`depends:[]\`
  > After this: Done.
`);
      writeMilestoneValidation(base, 'M001');
      writeMilestoneSummary(base, 'M001', '# M001 Summary\n\nFirst milestone complete.');

      // M002: only CONTEXT-DRAFT.md
      writeContextDraft(base, 'M002', '# Draft for M002\n\nSeed material.');

      const state = await deriveState(base);

      assertEq(state.phase, 'needs-discussion', 'phase is needs-discussion for M002');
      assertEq(state.activeMilestone?.id, 'M002', 'activeMilestone id is M002');
      assertEq(state.activeSlice, null, 'activeSlice is null');
      assertEq(state.registry.length, 2, 'registry has 2 entries');
      assertEq(state.registry[0]?.status, 'complete', 'M001 is complete');
      assertEq(state.registry[1]?.status, 'active', 'M002 is active');
      assertEq(state.progress?.milestones?.done, 1, 'milestones done = 1');
      assertEq(state.progress?.milestones?.total, 2, 'milestones total = 2');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 5: Multi-milestone: M001 complete, M002 CONTEXT-DRAFT, M003 pending ──
  console.log('\n=== multi-milestone: M001 complete, M002 draft, M003 pending ===');
  {
    const base = createFixtureBase();
    try {
      // M001: complete
      writeRoadmap(base, 'M001', `# M001: First

**Vision:** Done.

## Slices

- [x] **S01: Done** \`risk:low\` \`depends:[]\`
  > After this: Done.
`);
      writeMilestoneValidation(base, 'M001');
      writeMilestoneSummary(base, 'M001', '# M001 Summary\n\nComplete.');

      // M002: draft only — should become active with needs-discussion
      writeContextDraft(base, 'M002', '# M002 Draft\n\nSeed.');

      // M003: blank milestone directory — should be pending
      mkdirSync(join(base, '.gsd', 'milestones', 'M003'), { recursive: true });

      const state = await deriveState(base);

      assertEq(state.phase, 'needs-discussion', 'phase is needs-discussion for M002');
      assertEq(state.activeMilestone?.id, 'M002', 'activeMilestone is M002');
      assertEq(state.registry.length, 3, 'registry has 3 entries');
      assertEq(state.registry[0]?.status, 'complete', 'M001 is complete');
      assertEq(state.registry[1]?.status, 'active', 'M002 is active');
      assertEq(state.registry[2]?.status, 'pending', 'M003 is pending');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 6: Milestone with ROADMAP + CONTEXT-DRAFT → ROADMAP takes precedence ──
  console.log('\n=== milestone with ROADMAP + CONTEXT-DRAFT → normal execution ===');
  {
    const base = createFixtureBase();
    try {
      // M001 has ROADMAP.md (active slice, incomplete tasks) and CONTEXT-DRAFT.md
      // The ROADMAP should take precedence — we're past the draft phase
      writeRoadmap(base, 'M001', `# M001: Active Milestone

**Vision:** In progress.

## Slices

- [ ] **S01: First Slice** \`risk:low\` \`depends:[]\`
  > After this: First slice done.
`);
      writeContextDraft(base, 'M001', '# Draft\n\nThis should be ignored — roadmap exists.');

      // Add a plan so it goes to executing phase
      writePlan(base, 'M001', 'S01', `# S01: First Slice

**Goal:** Do something.

## Tasks

- [ ] **T01: First Task** \`est:30m\`
`);

      const state = await deriveState(base);

      assertEq(state.phase, 'executing', 'phase is executing (ROADMAP takes precedence over CONTEXT-DRAFT)');
      assertEq(state.activeMilestone?.id, 'M001', 'activeMilestone is M001');
      assertEq(state.activeSlice?.id, 'S01', 'activeSlice is S01');
      assertEq(state.activeTask?.id, 'T01', 'activeTask is T01');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 7: Empty milestone dir (no files at all) → pre-planning ─────
  console.log('\n=== empty milestone dir (no files) → pre-planning ===');
  {
    const base = createFixtureBase();
    try {
      // M001: just a directory, no files at all
      mkdirSync(join(base, '.gsd', 'milestones', 'M001'), { recursive: true });

      const state = await deriveState(base);

      assertEq(state.phase, 'pre-planning', 'phase is pre-planning for blank milestone');
      assertEq(state.activeMilestone?.id, 'M001', 'activeMilestone is M001');
      assertEq(state.registry[0]?.status, 'active', 'registry[0] status is active');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 8: CONTEXT-DRAFT on non-first active milestone ──────────────
  // M001 has no summary and no roadmap (active), M002 has CONTEXT-DRAFT
  // M001 should be active (pre-planning), M002 should be pending
  console.log('\n=== CONTEXT-DRAFT on non-active milestone → pending ===');
  {
    const base = createFixtureBase();
    try {
      // M001: blank (no roadmap, no summary) → becomes active first
      mkdirSync(join(base, '.gsd', 'milestones', 'M001'), { recursive: true });

      // M002: has CONTEXT-DRAFT but isn't active (M001 is first)
      writeContextDraft(base, 'M002', '# M002 Draft\n\nSeed.');

      const state = await deriveState(base);

      assertEq(state.phase, 'pre-planning', 'phase is pre-planning (M001 is active, not M002)');
      assertEq(state.activeMilestone?.id, 'M001', 'activeMilestone is M001');
      assertEq(state.registry[0]?.status, 'active', 'M001 is active');
      assertEq(state.registry[1]?.status, 'pending', 'M002 is pending');
    } finally {
      cleanup(base);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Draft-aware state derivation tests: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
