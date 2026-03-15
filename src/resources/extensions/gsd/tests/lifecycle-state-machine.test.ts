// GSD Full Lifecycle State Machine Test
//
// Tests the complete GSD workflow state machine by walking through all phase
// transitions using filesystem fixtures — no LLM required. Each step simulates
// what the LLM would produce (writing files to .gsd/) and verifies deriveState()
// returns the correct next phase.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { deriveState, invalidateStateCache } from '../state.ts';
import { clearParseCache } from '../files.ts';
import { clearPathCache } from '../paths.ts';
import { createTestContext } from './test-helpers.ts';

const { assertEq, assertTrue, report } = createTestContext();

// ─── Fixture Helpers ───────────────────────────────────────────────────────

function createFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'gsd-lifecycle-test-'));
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
  writeFileSync(join(dir, `${sid}-PLAN.md`), content);
}

function writeTaskSummary(base: string, mid: string, sid: string, tid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid, 'slices', sid, 'tasks');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${tid}-SUMMARY.md`), content);
}

function writeSliceSummary(base: string, mid: string, sid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid, 'slices', sid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sid}-SUMMARY.md`), content);
}

function writeMilestoneSummary(base: string, mid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-SUMMARY.md`), content);
}

function writeContinue(base: string, mid: string, sid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid, 'slices', sid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sid}-CONTINUE.md`), content);
}

function writeReplan(base: string, mid: string, sid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid, 'slices', sid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sid}-REPLAN.md`), content);
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

/** Wrapper that invalidates all caches before deriving (avoids stale reads) */
async function freshDeriveState(basePath: string) {
  invalidateStateCache();
  clearParseCache();
  clearPathCache();
  return deriveState(basePath);
}

function makeTaskSummary(tid: string, blockerDiscovered: boolean = false): string {
  return `---
id: ${tid}
parent: S01
milestone: M001
provides: []
key_files: []
key_decisions: []
patterns_established: []
observability_surfaces: []
duration: 15min
verification_result: passed
completed_at: 2025-03-10T12:00:00Z
blocker_discovered: ${blockerDiscovered}
---

# ${tid}: Test Task

**Completed successfully.**

## What Happened

Work was done.
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: Full Single-Milestone Lifecycle
//
// Walks through every phase transition for a single milestone with 1 slice
// and 2 tasks. Each step adds files that simulate what the LLM would produce.
//
// pre-planning → needs-discussion → pre-planning → planning → executing
// → executing (T02) → summarizing → completing-milestone → complete
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {

  console.log('\n' + '═'.repeat(70));
  console.log('TEST 1: Full Single-Milestone Lifecycle (8 phases)');
  console.log('═'.repeat(70));
  {
    const base = createFixtureBase();
    try {
      // ── Step 1: Empty project → pre-planning ───────────────────────────
      console.log('\n── Step 1: Empty project → pre-planning');
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'pre-planning', 'step1: phase is pre-planning');
        assertEq(state.activeMilestone, null, 'step1: no active milestone');
        assertEq(state.activeSlice, null, 'step1: no active slice');
        assertEq(state.activeTask, null, 'step1: no active task');
      }

      // ── Step 2: User seeds discussion → needs-discussion ──────────────
      console.log('\n── Step 2: CONTEXT-DRAFT created → needs-discussion');
      writeContextDraft(base, 'M001', `# M001: Build Auth System

## Initial Thoughts
JWT-based auth with refresh tokens.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'needs-discussion', 'step2: phase is needs-discussion');
        assertEq(state.activeMilestone?.id, 'M001', 'step2: active milestone is M001');
        assertTrue(
          state.nextAction.includes('Discuss'),
          'step2: nextAction mentions Discuss'
        );
      }

      // ── Step 3: Discussion complete, CONTEXT.md written → pre-planning
      console.log('\n── Step 3: CONTEXT.md written (discussion done) → pre-planning');
      writeContext(base, 'M001', `---
title: Build Auth System
---

# Build Auth System

## Decisions
- Use JWT with RS256
- Refresh tokens stored in httpOnly cookies
- Session expiry: 15 minutes
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'pre-planning', 'step3: phase is pre-planning');
        assertEq(state.activeMilestone?.id, 'M001', 'step3: active milestone is M001');
        assertEq(state.activeSlice, null, 'step3: no active slice yet');
      }

      // ── Step 4: Roadmap created with slices → planning (S01 needs plan)
      console.log('\n── Step 4: ROADMAP created → planning (S01 has no plan)');
      writeRoadmap(base, 'M001', `# M001: Build Auth System

**Vision:** JWT auth with refresh tokens.

## Slices

- [ ] **S01: Core JWT Logic** \`risk:low\` \`depends:[]\`
  > After this: JWT tokens can be generated and verified.

- [ ] **S02: Login Endpoints** \`risk:medium\` \`depends:[S01]\`
  > After this: Users can log in and receive tokens.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'planning', 'step4: phase is planning');
        assertEq(state.activeSlice?.id, 'S01', 'step4: active slice is S01');
        assertEq(state.activeTask, null, 'step4: no active task (plan not written yet)');
        assertEq(state.progress?.slices?.done, 0, 'step4: 0 slices done');
        assertEq(state.progress?.slices?.total, 2, 'step4: 2 slices total');
      }

      // ── Step 5: S01 plan created with tasks → executing (T01)
      console.log('\n── Step 5: S01 plan created → executing T01');
      writePlan(base, 'M001', 'S01', `# S01: Core JWT Logic

**Goal:** Implement JWT token generation and verification.
**Demo:** Unit tests pass for token create/verify.

## Tasks

- [ ] **T01: JWT Types & Helpers** \`est:15m\`
  Create TypeScript types and utility functions for JWT.

- [ ] **T02: Token Tests** \`est:15m\`
  Write unit tests for token generation and verification.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'executing', 'step5: phase is executing');
        assertEq(state.activeSlice?.id, 'S01', 'step5: active slice is S01');
        assertEq(state.activeTask?.id, 'T01', 'step5: active task is T01');
        assertEq(state.progress?.tasks?.done, 0, 'step5: 0 tasks done');
        assertEq(state.progress?.tasks?.total, 2, 'step5: 2 tasks total');
      }

      // ── Step 6: T01 complete → executing (T02)
      console.log('\n── Step 6: T01 summary written → executing T02');
      writeTaskSummary(base, 'M001', 'S01', 'T01', makeTaskSummary('T01'));
      // Mark T01 as done in plan (LLM checks the checkbox)
      writePlan(base, 'M001', 'S01', `# S01: Core JWT Logic

**Goal:** Implement JWT token generation and verification.
**Demo:** Unit tests pass for token create/verify.

## Tasks

- [x] **T01: JWT Types & Helpers** \`est:15m\`
  Create TypeScript types and utility functions for JWT.

- [ ] **T02: Token Tests** \`est:15m\`
  Write unit tests for token generation and verification.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'executing', 'step6: phase is executing');
        assertEq(state.activeSlice?.id, 'S01', 'step6: still on S01');
        assertEq(state.activeTask?.id, 'T02', 'step6: active task is now T02');
        assertEq(state.progress?.tasks?.done, 1, 'step6: 1 task done');
        assertEq(state.progress?.tasks?.total, 2, 'step6: 2 tasks total');
      }

      // ── Step 7: T02 complete, all tasks done → summarizing
      console.log('\n── Step 7: T02 done, all tasks complete → summarizing');
      writeTaskSummary(base, 'M001', 'S01', 'T02', makeTaskSummary('T02'));
      writePlan(base, 'M001', 'S01', `# S01: Core JWT Logic

**Goal:** Implement JWT token generation and verification.
**Demo:** Unit tests pass for token create/verify.

## Tasks

- [x] **T01: JWT Types & Helpers** \`est:15m\`
  Create TypeScript types and utility functions for JWT.

- [x] **T02: Token Tests** \`est:15m\`
  Write unit tests for token generation and verification.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'summarizing', 'step7: phase is summarizing');
        assertEq(state.activeSlice?.id, 'S01', 'step7: slice S01 needs summary');
        assertEq(state.activeTask, null, 'step7: no active task (all done)');
        assertEq(state.progress?.tasks?.done, 2, 'step7: 2 tasks done');
        assertEq(state.progress?.tasks?.total, 2, 'step7: 2 tasks total');
      }

      // ── Step 8: S01 summary written, marked [x] → planning (S02)
      console.log('\n── Step 8: S01 complete, S02 deps satisfied → planning S02');
      writeSliceSummary(base, 'M001', 'S01', `---
id: S01
title: Core JWT Logic
---

# S01: Core JWT Logic

## Summary
JWT types and helpers implemented. All tests pass.
`);
      writeRoadmap(base, 'M001', `# M001: Build Auth System

**Vision:** JWT auth with refresh tokens.

## Slices

- [x] **S01: Core JWT Logic** \`risk:low\` \`depends:[]\`
  > After this: JWT tokens can be generated and verified.

- [ ] **S02: Login Endpoints** \`risk:medium\` \`depends:[S01]\`
  > After this: Users can log in and receive tokens.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'planning', 'step8: phase is planning (S02 needs plan)');
        assertEq(state.activeSlice?.id, 'S02', 'step8: active slice is S02');
        assertEq(state.progress?.slices?.done, 1, 'step8: 1 slice done');
        assertEq(state.progress?.slices?.total, 2, 'step8: 2 slices total');
      }

      // ── Step 9: S02 planned, task executing → executing
      console.log('\n── Step 9: S02 planned → executing T01');
      writePlan(base, 'M001', 'S02', `# S02: Login Endpoints

**Goal:** Implement login and signup endpoints.
**Demo:** Can POST /login and receive JWT.

## Tasks

- [ ] **T01: Login Route** \`est:20m\`
  Build the login endpoint.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'executing', 'step9: phase is executing');
        assertEq(state.activeSlice?.id, 'S02', 'step9: active slice is S02');
        assertEq(state.activeTask?.id, 'T01', 'step9: active task is T01');
      }

      // ── Step 10: S02 T01 done → summarizing
      console.log('\n── Step 10: S02 T01 done → summarizing');
      writeTaskSummary(base, 'M001', 'S02', 'T01', `---
id: T01
parent: S02
milestone: M001
blocker_discovered: false
---

# T01: Login Route

**Built login endpoint.**
`);
      writePlan(base, 'M001', 'S02', `# S02: Login Endpoints

**Goal:** Implement login and signup endpoints.
**Demo:** Can POST /login and receive JWT.

## Tasks

- [x] **T01: Login Route** \`est:20m\`
  Build the login endpoint.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'summarizing', 'step10: phase is summarizing');
        assertEq(state.activeSlice?.id, 'S02', 'step10: S02 needs summary');
      }

      // ── Step 11: S02 summary written, all slices [x] → completing-milestone
      console.log('\n── Step 11: S02 complete, all slices done → completing-milestone');
      writeSliceSummary(base, 'M001', 'S02', `---
id: S02
title: Login Endpoints
---

# S02 Summary
Login endpoints implemented.
`);
      writeRoadmap(base, 'M001', `# M001: Build Auth System

**Vision:** JWT auth with refresh tokens.

## Slices

- [x] **S01: Core JWT Logic** \`risk:low\` \`depends:[]\`
  > After this: JWT tokens can be generated and verified.

- [x] **S02: Login Endpoints** \`risk:medium\` \`depends:[S01]\`
  > After this: Users can log in and receive tokens.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'completing-milestone', 'step11: phase is completing-milestone');
        assertEq(state.activeMilestone?.id, 'M001', 'step11: active milestone is M001');
        assertEq(state.activeSlice, null, 'step11: no active slice');
        assertEq(state.progress?.slices?.done, 2, 'step11: 2 slices done');
        assertEq(state.progress?.slices?.total, 2, 'step11: 2 slices total');
      }

      // ── Step 12: Milestone summary written → complete
      console.log('\n── Step 12: Milestone summary written → complete');
      writeMilestoneSummary(base, 'M001', `---
id: M001
title: Build Auth System
---

# M001: Build Auth System

## Summary
JWT auth system with login endpoints. 2 slices, 3 tasks completed.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'complete', 'step12: phase is complete');
        assertEq(state.activeSlice, null, 'step12: no active slice');
        assertEq(state.activeTask, null, 'step12: no active task');
        assertEq(state.registry.length, 1, 'step12: registry has 1 entry');
        assertEq(state.registry[0]?.status, 'complete', 'step12: M001 is complete');
        assertEq(state.progress?.milestones?.done, 1, 'step12: 1 milestone done');
        assertEq(state.progress?.milestones?.total, 1, 'step12: 1 milestone total');
      }

    } finally {
      cleanup(base);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 2: Multi-Milestone Sequential Lifecycle
  //
  // M001 completes → M002 becomes active → M002 completes → all complete
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(70));
  console.log('TEST 2: Multi-Milestone Sequential Lifecycle');
  console.log('═'.repeat(70));
  {
    const base = createFixtureBase();
    try {
      // ── Setup M001 as complete
      writeRoadmap(base, 'M001', `# M001: Foundation

**Vision:** Base setup.

## Slices

- [x] **S01: Init** \`risk:low\` \`depends:[]\`
  > After this: Project initialized.
`);
      writeMilestoneSummary(base, 'M001', `# M001 Summary\n\nFoundation complete.`);

      // ── M002 exists with CONTEXT-DRAFT → needs-discussion
      console.log('\n── M001 complete, M002 has draft → needs-discussion');
      writeContextDraft(base, 'M002', '# M002: Features\n\nAdd core features.');
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'needs-discussion', 'multi-ms step1: needs-discussion');
        assertEq(state.activeMilestone?.id, 'M002', 'multi-ms step1: active is M002');
        assertEq(state.registry[0]?.status, 'complete', 'multi-ms step1: M001 complete');
        assertEq(state.registry[1]?.status, 'active', 'multi-ms step1: M002 active');
      }

      // ── M002 gets CONTEXT + ROADMAP + plan → executing
      console.log('\n── M002 discussed + planned → executing');
      writeContext(base, 'M002', '# M002 Context\n\nDecisions made.');
      writeRoadmap(base, 'M002', `# M002: Features

**Vision:** Core features.

## Slices

- [ ] **S01: Feature A** \`risk:low\` \`depends:[]\`
  > After this: Feature A works.
`);
      writePlan(base, 'M002', 'S01', `# S01: Feature A

**Goal:** Build feature A.
**Demo:** It works.

## Tasks

- [ ] **T01: Implement** \`est:15m\`
  Build it.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'executing', 'multi-ms step2: executing');
        assertEq(state.activeMilestone?.id, 'M002', 'multi-ms step2: active is M002');
        assertEq(state.activeSlice?.id, 'S01', 'multi-ms step2: active slice S01');
        assertEq(state.activeTask?.id, 'T01', 'multi-ms step2: active task T01');
      }

      // ── Complete M002 fully
      console.log('\n── M002 fully complete → all complete');
      writeTaskSummary(base, 'M002', 'S01', 'T01', makeTaskSummary('T01'));
      writePlan(base, 'M002', 'S01', `# S01: Feature A

**Goal:** Build feature A.
**Demo:** It works.

## Tasks

- [x] **T01: Implement** \`est:15m\`
  Build it.
`);
      writeSliceSummary(base, 'M002', 'S01', '# S01 Summary\n\nFeature A built.');
      writeRoadmap(base, 'M002', `# M002: Features

**Vision:** Core features.

## Slices

- [x] **S01: Feature A** \`risk:low\` \`depends:[]\`
  > After this: Feature A works.
`);
      writeMilestoneSummary(base, 'M002', '# M002 Summary\n\nAll features built.');
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'complete', 'multi-ms step3: complete');
        assertEq(state.progress?.milestones?.done, 2, 'multi-ms step3: 2 milestones done');
        assertEq(state.progress?.milestones?.total, 2, 'multi-ms step3: 2 milestones total');
        assertEq(state.registry[0]?.status, 'complete', 'multi-ms step3: M001 complete');
        assertEq(state.registry[1]?.status, 'complete', 'multi-ms step3: M002 complete');
      }

    } finally {
      cleanup(base);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 3: Blocker Discovery → Replanning → Recovery
  //
  // T01 discovers a blocker → replanning-slice → REPLAN.md written →
  // continues executing remaining tasks
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(70));
  console.log('TEST 3: Blocker → Replan → Recovery');
  console.log('═'.repeat(70));
  {
    const base = createFixtureBase();
    try {
      writeRoadmap(base, 'M001', `# M001: API

**Vision:** Build API.

## Slices

- [ ] **S01: Endpoints** \`risk:medium\` \`depends:[]\`
  > After this: API endpoints work.
`);

      writePlan(base, 'M001', 'S01', `# S01: Endpoints

**Goal:** Build API endpoints.
**Demo:** Endpoints respond.

## Tasks

- [x] **T01: Routes** \`est:15m\`
  Set up routes.

- [ ] **T02: Handlers** \`est:15m\`
  Implement handlers.
`);

      // ── T01 completed with blocker_discovered: true → replanning-slice
      console.log('\n── T01 discovers blocker → replanning-slice');
      writeTaskSummary(base, 'M001', 'S01', 'T01', makeTaskSummary('T01', true));
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'replanning-slice', 'blocker step1: phase is replanning-slice');
        assertEq(state.activeSlice?.id, 'S01', 'blocker step1: active slice S01');
        assertTrue(state.blockers.length > 0, 'blocker step1: blockers non-empty');
        assertTrue(
          state.blockers[0]!.includes('T01'),
          'blocker step1: blocker mentions T01'
        );
      }

      // ── REPLAN.md written → back to executing (T02)
      console.log('\n── REPLAN.md written → executing T02');
      writeReplan(base, 'M001', 'S01', `# S01 Replan

## Changes
- Adjusted approach based on T01 findings.
- T02 will use different strategy.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'executing', 'blocker step2: phase is executing');
        assertEq(state.activeTask?.id, 'T02', 'blocker step2: active task is T02');
      }

      // ── T02 completes normally → summarizing
      console.log('\n── T02 completes → summarizing');
      writeTaskSummary(base, 'M001', 'S01', 'T02', makeTaskSummary('T02', false));
      writePlan(base, 'M001', 'S01', `# S01: Endpoints

**Goal:** Build API endpoints.
**Demo:** Endpoints respond.

## Tasks

- [x] **T01: Routes** \`est:15m\`
  Set up routes.

- [x] **T02: Handlers** \`est:15m\`
  Implement handlers.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'summarizing', 'blocker step3: phase is summarizing');
        assertEq(state.activeSlice?.id, 'S01', 'blocker step3: S01 needs summary');
      }

    } finally {
      cleanup(base);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 4: Slice Dependency Chain
  //
  // S01 (no deps) → S02 (depends:[S01]) → S03 (depends:[S02])
  // Verifies S02 is blocked until S01 completes, S03 blocked until S02.
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(70));
  console.log('TEST 4: Slice Dependency Chain');
  console.log('═'.repeat(70));
  {
    const base = createFixtureBase();
    try {
      const roadmapWithDeps = (s01Done: boolean, s02Done: boolean) => `# M001: Pipeline

**Vision:** Data pipeline.

## Slices

- [${s01Done ? 'x' : ' '}] **S01: Ingest** \`risk:low\` \`depends:[]\`
  > After this: Data ingested.

- [${s02Done ? 'x' : ' '}] **S02: Transform** \`risk:medium\` \`depends:[S01]\`
  > After this: Data transformed.

- [ ] **S03: Load** \`risk:low\` \`depends:[S02]\`
  > After this: Data loaded.
`;

      // ── S01 is first eligible slice
      console.log('\n── All incomplete → S01 is active (no deps)');
      writeRoadmap(base, 'M001', roadmapWithDeps(false, false));
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'planning', 'deps step1: planning');
        assertEq(state.activeSlice?.id, 'S01', 'deps step1: active is S01 (only eligible)');
      }

      // ── S01 complete → S02 becomes eligible
      console.log('\n── S01 complete → S02 active');
      writeRoadmap(base, 'M001', roadmapWithDeps(true, false));
      writeSliceSummary(base, 'M001', 'S01', '# S01 Done\n\nIngestion complete.');
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'planning', 'deps step2: planning');
        assertEq(state.activeSlice?.id, 'S02', 'deps step2: active is S02 (S01 done, deps met)');
      }

      // ── S02 complete → S03 becomes eligible
      console.log('\n── S02 complete → S03 active');
      writeRoadmap(base, 'M001', roadmapWithDeps(true, true));
      writeSliceSummary(base, 'M001', 'S02', '# S02 Done\n\nTransformation complete.');
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'planning', 'deps step3: planning');
        assertEq(state.activeSlice?.id, 'S03', 'deps step3: active is S03 (S02 done, deps met)');
      }

    } finally {
      cleanup(base);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 5: Interrupted Work Resume
  //
  // Task in progress with CONTINUE.md → executing with resume context
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(70));
  console.log('TEST 5: Interrupted Work Resume');
  console.log('═'.repeat(70));
  {
    const base = createFixtureBase();
    try {
      writeRoadmap(base, 'M001', `# M001: Test

**Vision:** Test.

## Slices

- [ ] **S01: Work** \`risk:low\` \`depends:[]\`
  > After this: Done.
`);

      writePlan(base, 'M001', 'S01', `# S01: Work

**Goal:** Do work.
**Demo:** It works.

## Tasks

- [ ] **T01: First** \`est:30m\`
  Long task.

- [ ] **T02: Second** \`est:15m\`
  Short task.
`);

      // ── T01 interrupted mid-execution
      console.log('\n── T01 interrupted → executing with resume signal');
      writeContinue(base, 'M001', 'S01', `---
milestone: M001
slice: S01
task: T01
step: 3
totalSteps: 7
status: interrupted
savedAt: 2026-03-15T10:00:00Z
---

# Continue: T01

## Completed Work
Steps 1-2: Set up project structure and initial files.

## Remaining Work
Steps 3-7: Implement core logic, tests, integration.

## Next Action
Continue from step 3: implement core logic.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'executing', 'resume step1: phase is executing');
        assertEq(state.activeTask?.id, 'T01', 'resume step1: active task T01');
        assertTrue(
          state.nextAction.includes('Resume') ||
          state.nextAction.includes('resume') ||
          state.nextAction.includes('continue') ||
          state.nextAction.includes('Continue'),
          'resume step1: nextAction signals resume'
        );
      }

    } finally {
      cleanup(base);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 6: Milestone Dependency Chain
  //
  // M002 depends on M001. M002 should be pending until M001 completes.
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(70));
  console.log('TEST 6: Milestone Dependency Chain');
  console.log('═'.repeat(70));
  {
    const base = createFixtureBase();
    try {
      // ── M001 active, M002 depends on M001
      console.log('\n── M001 active, M002 depends on M001 → M001 is active');
      writeRoadmap(base, 'M001', `# M001: Base

**Vision:** Foundation.

## Slices

- [ ] **S01: Setup** \`risk:low\` \`depends:[]\`
  > After this: Base ready.
`);

      writeContext(base, 'M002', `---
depends_on: [M001]
---

# M002: Extensions
Build on top of M001.
`);
      writeRoadmap(base, 'M002', `# M002: Extensions

**Vision:** Extensions.

## Slices

- [ ] **S01: Extend** \`risk:low\` \`depends:[]\`
  > After this: Extensions work.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.activeMilestone?.id, 'M001', 'ms-dep step1: M001 is active');
        assertEq(state.phase, 'planning', 'ms-dep step1: phase is planning');
        assertTrue(
          state.registry.some(r => r.id === 'M002' && r.status === 'pending'),
          'ms-dep step1: M002 is pending'
        );
      }

      // ── Complete M001 → M002 becomes active
      console.log('\n── M001 complete → M002 becomes active');
      writeRoadmap(base, 'M001', `# M001: Base

**Vision:** Foundation.

## Slices

- [x] **S01: Setup** \`risk:low\` \`depends:[]\`
  > After this: Base ready.
`);
      writeMilestoneSummary(base, 'M001', '# M001 Summary\n\nBase complete.');
      {
        const state = await freshDeriveState(base);
        assertEq(state.activeMilestone?.id, 'M002', 'ms-dep step2: M002 is now active');
        assertEq(state.phase, 'planning', 'ms-dep step2: M002 is in planning');
        assertEq(state.registry.find(r => r.id === 'M001')?.status, 'complete', 'ms-dep step2: M001 complete');
        assertEq(state.registry.find(r => r.id === 'M002')?.status, 'active', 'ms-dep step2: M002 active');
      }

    } finally {
      cleanup(base);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 7: Blocked State — All Slices Have Unmet Dependencies
  //
  // Only slices with unresolvable deps → blocked phase
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(70));
  console.log('TEST 7: All Slices Blocked → blocked phase');
  console.log('═'.repeat(70));
  {
    const base = createFixtureBase();
    try {
      writeRoadmap(base, 'M001', `# M001: Deadlock

**Vision:** Impossible deps.

## Slices

- [ ] **S01: First** \`risk:low\` \`depends:[S02]\`
  > After this: First done.

- [ ] **S02: Second** \`risk:low\` \`depends:[S01]\`
  > After this: Second done.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'blocked', 'circular: phase is blocked');
        assertTrue(state.blockers.length > 0, 'circular: blockers non-empty');
        assertEq(state.activeSlice, null, 'circular: no active slice');
      }
    } finally {
      cleanup(base);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 8: Progress Tracking Accuracy
  //
  // Verifies progress counters are accurate at each step.
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(70));
  console.log('TEST 8: Progress Tracking Across Multi-Slice Milestone');
  console.log('═'.repeat(70));
  {
    const base = createFixtureBase();
    try {
      // 3 slices, each with 1 task
      writeRoadmap(base, 'M001', `# M001: Progress

**Vision:** Track progress.

## Slices

- [ ] **S01: First** \`risk:low\` \`depends:[]\`
  > After this: 1/3.

- [ ] **S02: Second** \`risk:low\` \`depends:[]\`
  > After this: 2/3.

- [ ] **S03: Third** \`risk:low\` \`depends:[]\`
  > After this: 3/3.
`);

      // ── Initial: 0/3 slices
      console.log('\n── Initial: 0/3 slices done');
      {
        const state = await freshDeriveState(base);
        assertEq(state.progress?.slices?.done, 0, 'progress: 0 slices done initially');
        assertEq(state.progress?.slices?.total, 3, 'progress: 3 slices total');
        assertEq(state.progress?.milestones?.done, 0, 'progress: 0 milestones done');
        assertEq(state.progress?.milestones?.total, 1, 'progress: 1 milestone total');
      }

      // ── Complete S01
      console.log('\n── S01 complete: 1/3 slices done');
      writeSliceSummary(base, 'M001', 'S01', '# S01 Done');
      writeRoadmap(base, 'M001', `# M001: Progress

**Vision:** Track progress.

## Slices

- [x] **S01: First** \`risk:low\` \`depends:[]\`
  > After this: 1/3.

- [ ] **S02: Second** \`risk:low\` \`depends:[]\`
  > After this: 2/3.

- [ ] **S03: Third** \`risk:low\` \`depends:[]\`
  > After this: 3/3.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.progress?.slices?.done, 1, 'progress: 1 slice done after S01');
        assertEq(state.progress?.slices?.total, 3, 'progress: still 3 total');
      }

      // ── Complete S02
      console.log('\n── S02 complete: 2/3 slices done');
      writeSliceSummary(base, 'M001', 'S02', '# S02 Done');
      writeRoadmap(base, 'M001', `# M001: Progress

**Vision:** Track progress.

## Slices

- [x] **S01: First** \`risk:low\` \`depends:[]\`
  > After this: 1/3.

- [x] **S02: Second** \`risk:low\` \`depends:[]\`
  > After this: 2/3.

- [ ] **S03: Third** \`risk:low\` \`depends:[]\`
  > After this: 3/3.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.progress?.slices?.done, 2, 'progress: 2 slices done after S02');
      }

      // ── Complete S03 → completing-milestone
      console.log('\n── S03 complete: 3/3 → completing-milestone');
      writeSliceSummary(base, 'M001', 'S03', '# S03 Done');
      writeRoadmap(base, 'M001', `# M001: Progress

**Vision:** Track progress.

## Slices

- [x] **S01: First** \`risk:low\` \`depends:[]\`
  > After this: 1/3.

- [x] **S02: Second** \`risk:low\` \`depends:[]\`
  > After this: 2/3.

- [x] **S03: Third** \`risk:low\` \`depends:[]\`
  > After this: 3/3.
`);
      {
        const state = await freshDeriveState(base);
        assertEq(state.phase, 'completing-milestone', 'progress: completing-milestone');
        assertEq(state.progress?.slices?.done, 3, 'progress: 3 slices done');
        assertEq(state.progress?.slices?.total, 3, 'progress: 3 total');
      }

    } finally {
      cleanup(base);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Results
  // ═══════════════════════════════════════════════════════════════════════════

  report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
