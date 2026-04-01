import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { parseSummary } from '../files.ts';
import { deriveState } from '../state.ts';
import { buildExecuteTaskPrompt, buildReplanSlicePrompt } from '../auto-prompts.ts';

function createFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'gsd-pending-actions-'));
  mkdirSync(join(base, '.gsd', 'milestones'), { recursive: true });
  return base;
}

function isolatePreferences(t: { after(cb: () => void): void }, base: string): void {
  const fakeHome = mkdtempSync(join(tmpdir(), 'gsd-pending-actions-home-'));
  const savedCwd = process.cwd();
  const savedGsdHome = process.env.GSD_HOME;
  process.chdir(base);
  process.env.GSD_HOME = fakeHome;
  t.after(() => {
    process.chdir(savedCwd);
    if (savedGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = savedGsdHome;
    rmSync(base, { recursive: true, force: true });
    rmSync(fakeHome, { recursive: true, force: true });
  });
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

function writeTaskPlan(base: string, mid: string, sid: string, tid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid, 'slices', sid, 'tasks');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${tid}-PLAN.md`), content);
}

function writeTaskSummary(base: string, mid: string, sid: string, tid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid, 'slices', sid, 'tasks');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${tid}-SUMMARY.md`), content);
}

const ROADMAP_ONE_SLICE = `# M001: Test Milestone

**Vision:** Test vision.

## Slices

- [ ] **S01: Test Slice** \`risk:low\` \`depends:[]\`
  > After this: stuff works
`;

function makePlanT01DoneT02Pending(): string {
  return `# S01: Test Slice

**Goal:** Do things.
**Demo:** It works.

## Tasks

- [x] **T01: First task** \`est:15m\`
  First task description.

- [ ] **T02: Second task** \`est:15m\`
  Second task description.
`;
}

function makePlanT01DoneOnly(): string {
  return `# S01: Test Slice

**Goal:** Do things.
**Demo:** It works.

## Tasks

- [x] **T01: First task** \`est:15m\`
  First task description.
`;
}

function makeTaskSummaryWithPendingActions(tid: string, actions: string[]): string {
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
blocker_discovered: false
---

# ${tid}: Test Task

**Did something.**

## What Happened

Work was done.

## Known Issues

Pending actions:
${actions.map((action) => `- ${action}`).join('\n')}

Minor caveat.
`;
}

test('parseSummary extracts knownIssues and pendingActions from Known Issues', () => {
  const summary = parseSummary(makeTaskSummaryWithPendingActions('T01', ['finish migration', 'add regression test']));
  assert.equal(summary.pendingActions.length, 2);
  assert.deepEqual(summary.pendingActions, ['finish migration', 'add regression test']);
  assert.match(summary.knownIssues, /Pending actions:/);
  assert.match(summary.knownIssues, /Minor caveat/);
});

test('deriveState routes to replanning-slice when a completed task leaves pending actions and later tasks remain', async () => {
  const base = createFixtureBase();
  try {
    writeRoadmap(base, 'M001', ROADMAP_ONE_SLICE);
    writePlan(base, 'M001', 'S01', makePlanT01DoneT02Pending());
    writeTaskPlan(base, 'M001', 'S01', 'T02', '# T02: Second task\n\nDo the next thing.\n');
    writeTaskSummary(base, 'M001', 'S01', 'T01', makeTaskSummaryWithPendingActions('T01', ['finish migration']));

    const state = await deriveState(base);
    assert.equal(state.phase, 'replanning-slice');
    assert.equal(state.activeTask?.id, 'T02');
    assert.match(state.nextAction, /pending actions/i);
    assert.match(state.blockers[0] ?? '', /finish migration/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('deriveState routes to replanning-slice instead of summarizing when all tasks are done but pending actions remain', async () => {
  const base = createFixtureBase();
  try {
    writeRoadmap(base, 'M001', ROADMAP_ONE_SLICE);
    writePlan(base, 'M001', 'S01', makePlanT01DoneOnly());
    writeTaskSummary(base, 'M001', 'S01', 'T01', makeTaskSummaryWithPendingActions('T01', ['add the final follow-up task']));

    const state = await deriveState(base);
    assert.equal(state.phase, 'replanning-slice');
    assert.equal(state.activeTask, null);
    assert.match(state.nextAction, /pending actions/i);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('buildExecuteTaskPrompt includes pending_actions in carry-forward context', async (t) => {
  const base = createFixtureBase();
  isolatePreferences(t, base);
  try {
    writeRoadmap(base, 'M001', ROADMAP_ONE_SLICE);
    writePlan(base, 'M001', 'S01', makePlanT01DoneT02Pending());
    writeTaskPlan(base, 'M001', 'S01', 'T02', '# T02: Second task\n\nDo the next thing.\n');
    writeTaskSummary(base, 'M001', 'S01', 'T01', makeTaskSummaryWithPendingActions('T01', ['finish migration']));

    const prompt = await buildExecuteTaskPrompt('M001', 'S01', 'Test Slice', 'T02', 'Second task', base, 'standard');
    assert.match(prompt, /pending_actions: finish migration/);
    assert.match(prompt, /Pending actions:/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('buildReplanSlicePrompt includes Pending Action Context when triggered by pending actions', async (t) => {
  const base = createFixtureBase();
  isolatePreferences(t, base);
  try {
    writeRoadmap(base, 'M001', ROADMAP_ONE_SLICE);
    writePlan(base, 'M001', 'S01', makePlanT01DoneT02Pending());
    writeTaskPlan(base, 'M001', 'S01', 'T02', '# T02: Second task\n\nDo the next thing.\n');
    writeTaskSummary(base, 'M001', 'S01', 'T01', makeTaskSummaryWithPendingActions('T01', ['finish migration', 'add regression test']));

    const prompt = await buildReplanSlicePrompt('M001', 'Test Milestone', 'S01', 'Test Slice', base);
    assert.match(prompt, /Pending Action Context/);
    assert.match(prompt, /- finish migration/);
    assert.match(prompt, /- add regression test/);
    assert.match(prompt, /Trigger Task Summary: T01/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
