import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { deriveState, invalidateStateCache, getActiveMilestoneId } from '../state.ts';
import { clearPathCache } from '../paths.ts';
import { parkMilestone, unparkMilestone, discardMilestone, isParked, getParkedReason } from '../milestone-actions.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

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
  const base = mkdtempSync(join(tmpdir(), 'gsd-park-test-'));
  mkdirSync(join(base, '.gsd', 'milestones'), { recursive: true });
  return base;
}

function createMilestone(base: string, mid: string, opts?: { withRoadmap?: boolean; withSummary?: boolean; dependsOn?: string[] }): void {
  const mDir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(mDir, { recursive: true });

  if (opts?.dependsOn) {
    writeFileSync(join(mDir, `${mid}-CONTEXT.md`), [
      '---',
      `depends_on: [${opts.dependsOn.join(', ')}]`,
      '---',
      '',
      `# ${mid} Context`,
    ].join('\n'), 'utf-8');
  }

  if (opts?.withRoadmap) {
    writeFileSync(join(mDir, `${mid}-ROADMAP.md`), [
      `# ${mid}: Test Milestone`,
      '',
      '## Vision',
      'Test milestone for park/unpark testing.',
      '',
      '## Success Criteria',
      '- [ ] Tests pass',
      '',
      '## Slices',
      `- [${opts?.withSummary ? 'x' : ' '}] **S01: Setup** \`risk:low\` \`depends:[]\``,
      '  - After this: Basic setup complete.',
    ].join('\n'), 'utf-8');
  }

  if (opts?.withSummary) {
    writeFileSync(join(mDir, `${mid}-SUMMARY.md`), [
      '---',
      `id: ${mid}`,
      '---',
      '',
      `# ${mid} — Complete`,
    ].join('\n'), 'utf-8');
  }
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

function clearCaches(): void {
  clearPathCache();
  invalidateStateCache();
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {

  // ─── Test 1: parkMilestone creates PARKED.md ──────────────────────────
  console.log('\n=== parkMilestone creates PARKED.md ===');
  {
    const base = createFixtureBase();
    try {
      createMilestone(base, 'M001', { withRoadmap: true });
      clearCaches();

      const success = parkMilestone(base, 'M001', 'Priority shift');
      assert(success, 'parkMilestone returns true');
      assert(isParked(base, 'M001'), 'isParked returns true after parking');

      const reason = getParkedReason(base, 'M001');
      assertEq(reason, 'Priority shift', 'reason matches');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 2: parkMilestone is idempotent — fails if already parked ────
  console.log('\n=== parkMilestone fails if already parked ===');
  {
    const base = createFixtureBase();
    try {
      createMilestone(base, 'M001', { withRoadmap: true });
      clearCaches();

      parkMilestone(base, 'M001', 'First park');
      const secondPark = parkMilestone(base, 'M001', 'Second park');
      assert(!secondPark, 'second parkMilestone returns false');
      assertEq(getParkedReason(base, 'M001'), 'First park', 'reason unchanged from first park');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 3: unparkMilestone removes PARKED.md ────────────────────────
  console.log('\n=== unparkMilestone removes PARKED.md ===');
  {
    const base = createFixtureBase();
    try {
      createMilestone(base, 'M001', { withRoadmap: true });
      clearCaches();

      parkMilestone(base, 'M001', 'Test reason');
      assert(isParked(base, 'M001'), 'milestone is parked');

      const success = unparkMilestone(base, 'M001');
      assert(success, 'unparkMilestone returns true');
      assert(!isParked(base, 'M001'), 'isParked returns false after unpark');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 4: unparkMilestone fails if not parked ──────────────────────
  console.log('\n=== unparkMilestone fails if not parked ===');
  {
    const base = createFixtureBase();
    try {
      createMilestone(base, 'M001', { withRoadmap: true });
      clearCaches();

      const result = unparkMilestone(base, 'M001');
      assert(!result, 'unparkMilestone returns false when not parked');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 5: deriveState returns 'parked' status ──────────────────────
  console.log('\n=== deriveState returns parked status ===');
  {
    const base = createFixtureBase();
    try {
      createMilestone(base, 'M001', { withRoadmap: true });
      clearCaches();

      parkMilestone(base, 'M001', 'Test reason');

      const state = await deriveState(base);
      const entry = state.registry.find(e => e.id === 'M001');
      assert(!!entry, 'M001 in registry');
      assertEq(entry?.status, 'parked', 'status is parked');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 6: deriveState skips parked milestone for active ─────────────
  console.log('\n=== deriveState skips parked milestone ===');
  {
    const base = createFixtureBase();
    try {
      createMilestone(base, 'M001', { withRoadmap: true });
      createMilestone(base, 'M002', { withRoadmap: true });
      clearCaches();

      // Before park: M001 is active
      const stateBefore = await deriveState(base);
      assertEq(stateBefore.activeMilestone?.id, 'M001', 'before park: M001 is active');

      parkMilestone(base, 'M001', 'Testing');

      // After park: M002 becomes active
      const stateAfter = await deriveState(base);
      assertEq(stateAfter.activeMilestone?.id, 'M002', 'after park: M002 is active');

      // M001 still in registry as parked
      const m001 = stateAfter.registry.find(e => e.id === 'M001');
      assertEq(m001?.status, 'parked', 'M001 has parked status');

      // M002 is active
      const m002 = stateAfter.registry.find(e => e.id === 'M002');
      assertEq(m002?.status, 'active', 'M002 has active status');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 7: getActiveMilestoneId skips parked ────────────────────────
  console.log('\n=== getActiveMilestoneId skips parked ===');
  {
    const base = createFixtureBase();
    try {
      createMilestone(base, 'M001', { withRoadmap: true });
      createMilestone(base, 'M002', { withRoadmap: true });
      clearCaches();

      parkMilestone(base, 'M001', 'Testing');

      const activeId = await getActiveMilestoneId(base);
      assertEq(activeId, 'M002', 'getActiveMilestoneId returns M002');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 8: Parked milestone does NOT satisfy depends_on ─────────────
  console.log('\n=== Parked milestone does not satisfy depends_on ===');
  {
    const base = createFixtureBase();
    try {
      createMilestone(base, 'M001', { withRoadmap: true });
      createMilestone(base, 'M002', { withRoadmap: true, dependsOn: ['M001'] });
      clearCaches();

      parkMilestone(base, 'M001', 'Testing');

      const state = await deriveState(base);
      // M001 is parked, M002 depends on M001 → M002 should be pending, not active
      const m002 = state.registry.find(e => e.id === 'M002');
      assertEq(m002?.status, 'pending', 'M002 stays pending when M001 is parked');

      // No active milestone (both are blocked/parked)
      assertEq(state.activeMilestone, null, 'no active milestone');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 9: Park then unpark restores correct status ─────────────────
  console.log('\n=== Park then unpark restores status ===');
  {
    const base = createFixtureBase();
    try {
      createMilestone(base, 'M001', { withRoadmap: true });
      createMilestone(base, 'M002', { withRoadmap: true });
      clearCaches();

      // Park M001
      parkMilestone(base, 'M001', 'Testing');
      const stateParked = await deriveState(base);
      assertEq(stateParked.activeMilestone?.id, 'M002', 'while parked: M002 is active');

      // Unpark M001 — M001 should become active again (it's first in queue)
      unparkMilestone(base, 'M001');
      const stateUnparked = await deriveState(base);
      assertEq(stateUnparked.activeMilestone?.id, 'M001', 'after unpark: M001 is active again');
      assertEq(stateUnparked.registry.find(e => e.id === 'M001')?.status, 'active', 'M001 is active status');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 10: discardMilestone removes directory ──────────────────────
  console.log('\n=== discardMilestone removes directory ===');
  {
    const base = createFixtureBase();
    try {
      createMilestone(base, 'M001', { withRoadmap: true });
      clearCaches();

      const mDir = join(base, '.gsd', 'milestones', 'M001');
      assert(existsSync(mDir), 'milestone dir exists before discard');

      const success = discardMilestone(base, 'M001');
      assert(success, 'discardMilestone returns true');
      assert(!existsSync(mDir), 'milestone dir removed after discard');

      const state = await deriveState(base);
      assert(!state.registry.some(e => e.id === 'M001'), 'M001 not in registry after discard');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 11: discardMilestone updates queue order ────────────────────
  console.log('\n=== discardMilestone updates queue order ===');
  {
    const base = createFixtureBase();
    try {
      createMilestone(base, 'M001', { withRoadmap: true });
      createMilestone(base, 'M002', { withRoadmap: true });
      clearCaches();

      // Write a queue order that includes M001
      const queuePath = join(base, '.gsd', 'QUEUE-ORDER.json');
      writeFileSync(queuePath, JSON.stringify({ order: ['M001', 'M002'], updatedAt: new Date().toISOString() }), 'utf-8');

      discardMilestone(base, 'M001');

      // Queue order should no longer include M001
      const queueContent = JSON.parse(readFileSync(queuePath, 'utf-8'));
      assert(!queueContent.order.includes('M001'), 'M001 removed from queue order');
      assert(queueContent.order.includes('M002'), 'M002 still in queue order');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 12: All milestones parked → no active milestone ─────────────
  console.log('\n=== All milestones parked → no active ===');
  {
    const base = createFixtureBase();
    try {
      createMilestone(base, 'M001', { withRoadmap: true });
      clearCaches();

      parkMilestone(base, 'M001', 'Testing');

      const state = await deriveState(base);
      assertEq(state.activeMilestone, null, 'no active milestone when all parked');
      assertEq(state.phase, 'pre-planning', 'phase is pre-planning');
      assert(state.registry.length === 1, 'registry still has 1 entry');
      assertEq(state.registry[0]?.status, 'parked', 'entry is parked');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 13: Parked milestone without roadmap ────────────────────────
  console.log('\n=== Park milestone without roadmap ===');
  {
    const base = createFixtureBase();
    try {
      createMilestone(base, 'M001'); // No roadmap
      createMilestone(base, 'M002', { withRoadmap: true });
      clearCaches();

      parkMilestone(base, 'M001', 'Not ready yet');

      const state = await deriveState(base);
      assertEq(state.activeMilestone?.id, 'M002', 'M002 is active when M001 (no roadmap) is parked');
      assertEq(state.registry.find(e => e.id === 'M001')?.status, 'parked', 'M001 is parked');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test 14: Progress counts with parked milestone ───────────────────
  console.log('\n=== Progress counts with parked ===');
  {
    const base = createFixtureBase();
    try {
      createMilestone(base, 'M001', { withRoadmap: true, withSummary: true }); // complete
      createMilestone(base, 'M002', { withRoadmap: true }); // will park
      createMilestone(base, 'M003', { withRoadmap: true }); // will be active
      clearCaches();

      parkMilestone(base, 'M002', 'Parked');

      const state = await deriveState(base);
      assertEq(state.progress?.milestones.done, 1, '1 complete milestone');
      assertEq(state.progress?.milestones.total, 3, '3 total milestones (including parked)');
      assertEq(state.activeMilestone?.id, 'M003', 'M003 is active');
    } finally {
      cleanup(base);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Results
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('All tests passed ✓');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
