// Regression test for issue #3184
// SUMMARY.md with non-terminal frontmatter status must NOT mark a milestone complete.

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
  const base = mkdtempSync(join(tmpdir(), 'gsd-summary-fm-test-'));
  mkdirSync(join(base, '.gsd', 'milestones'), { recursive: true });
  return base;
}

function writeSummary(base: string, mid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-SUMMARY.md`), content);
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {

  // ─── Test A: SUMMARY.md with status: stub → milestone NOT complete ──────
  // (#3184) Stub summaries written during planning must NOT close a milestone.
  console.log('\n=== Test A: status: stub → milestone NOT complete (#3184) ===');
  {
    const base = createFixtureBase();
    try {
      writeSummary(base, 'M001', '---\nstatus: stub\n---\n\n# M001 Summary\n\nStub placeholder.\n');

      const state = await deriveState(base);

      assertEq(state.registry[0]?.status, 'active', 'Test A: registry[0] is active (not complete)');
      assertEq(state.activeMilestone?.id, 'M001', 'Test A: activeMilestone is M001');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test B: SUMMARY.md with status: complete → milestone IS complete ───
  console.log('\n=== Test B: status: complete → milestone IS complete ===');
  {
    const base = createFixtureBase();
    try {
      writeSummary(base, 'M001', '---\nstatus: complete\n---\n\n# M001 Summary\n\nMilestone complete.\n');

      const state = await deriveState(base);

      assertEq(state.registry[0]?.status, 'complete', 'Test B: registry[0] is complete');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test C: SUMMARY.md with status: done → milestone IS complete ───────
  console.log('\n=== Test C: status: done → milestone IS complete ===');
  {
    const base = createFixtureBase();
    try {
      writeSummary(base, 'M001', '---\nstatus: done\n---\n\n# M001 Summary\n\nDone.\n');

      const state = await deriveState(base);

      assertEq(state.registry[0]?.status, 'complete', 'Test C: registry[0] is complete');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test D: SUMMARY.md with status: validated → milestone IS complete ──
  console.log('\n=== Test D: status: validated → milestone IS complete ===');
  {
    const base = createFixtureBase();
    try {
      writeSummary(base, 'M001', '---\nstatus: validated\n---\n\n# M001 Summary\n\nValidated.\n');

      const state = await deriveState(base);

      assertEq(state.registry[0]?.status, 'complete', 'Test D: registry[0] is complete');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test E: SUMMARY.md with no frontmatter → milestone IS complete (backward compat) ──
  console.log('\n=== Test E: no frontmatter → milestone IS complete (backward compat) ===');
  {
    const base = createFixtureBase();
    try {
      writeSummary(base, 'M001', '# M001 Summary\n\nDone.\n');

      const state = await deriveState(base);

      assertEq(state.registry[0]?.status, 'complete', 'Test E: registry[0] is complete (no frontmatter)');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test F: SUMMARY.md with status: in-progress → milestone NOT complete ──
  // (#3184) in-progress is a non-terminal status like stub.
  console.log('\n=== Test F: status: in-progress → milestone NOT complete (#3184) ===');
  {
    const base = createFixtureBase();
    try {
      writeSummary(base, 'M001', '---\nstatus: in-progress\n---\n\n# M001 Summary\n\nWork in progress.\n');

      const state = await deriveState(base);

      assertEq(state.registry[0]?.status, 'active', 'Test F: registry[0] is active (not complete)');
      assertEq(state.activeMilestone?.id, 'M001', 'Test F: activeMilestone is M001');
    } finally {
      cleanup(base);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SUMMARY.md frontmatter completion tests: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
