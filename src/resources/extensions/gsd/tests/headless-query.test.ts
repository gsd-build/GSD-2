/**
 * Tests for headless query commands (gsd headless query <target>).
 *
 * Validates that each query target returns valid data with expected fields,
 * and that invalid/missing targets produce the correct exit code.
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { handleQuery } from '../../../../headless-query.ts'
import type { CostSummary, NextUnitPreview } from '../../../../headless-query.ts'
import type { GSDState } from '../types.ts'
import { invalidateStateCache } from '../state.ts'

// ─── Fixture Helpers ────────────────────────────────────────────────────────

function createFixture(): string {
  const base = mkdtempSync(join(tmpdir(), 'gsd-query-test-'))
  mkdirSync(join(base, '.gsd', 'milestones'), { recursive: true })
  return base
}

function writeRoadmap(base: string, mid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${mid}-ROADMAP.md`), content)
}

function writeContext(base: string, mid: string): void {
  const dir = join(base, '.gsd', 'milestones', mid)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${mid}-CONTEXT.md`), `---\ntitle: Test Milestone\n---\n\n# Context\nTest.`)
}

function writeSlicePlan(base: string, mid: string, sid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid, 'slices', sid)
  mkdirSync(join(dir, 'tasks'), { recursive: true })
  writeFileSync(join(dir, `${sid}-PLAN.md`), content)
}

function writeTaskPlan(base: string, mid: string, sid: string, tid: string): void {
  const dir = join(base, '.gsd', 'milestones', mid, 'slices', sid, 'tasks')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${tid}-PLAN.md`), `---\nestimated_steps: 3\nestimated_files: 2\n---\n\n# ${tid}: Test Task\nDo something.`)
}

function writeParallelStatus(base: string, mid: string, cost: number): void {
  const dir = join(base, '.gsd', 'parallel')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${mid}.status.json`), JSON.stringify({
    milestoneId: mid,
    pid: process.pid,
    state: 'running',
    currentUnit: { type: 'execute-task', id: `${mid}/S01/T01`, startedAt: Date.now() },
    completedUnits: 2,
    cost,
    lastHeartbeat: Date.now(),
    startedAt: Date.now() - 60_000,
    worktreePath: `/tmp/worktrees/${mid}`,
  }))
}

/** Create a milestone in executing phase (roadmap + slice plan + task plan). */
function createExecutingFixture(base: string): void {
  writeContext(base, 'M001')
  writeRoadmap(base, 'M001', `# M001: Test Milestone

**Vision:** Build something.

## Slices

- [ ] **S01: First Slice** \`risk:low\` \`depends:[]\`
  > After this: The first slice works.
`)
  writeSlicePlan(base, 'M001', 'S01', `# S01: First Slice

**Goal:** Implement something.
**Demo:** It works.

## Tasks

- [ ] **T01: First Task** — Do the first thing
  - Files: foo.ts
  - Verify: run tests
- [ ] **T02: Second Task** — Do the second thing
  - Files: bar.ts
`)
  writeTaskPlan(base, 'M001', 'S01', 'T01')
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('headless query', () => {
  let base: string

  beforeEach(() => {
    base = createFixture()
    invalidateStateCache()
  })

  afterEach(() => {
    rmSync(base, { recursive: true, force: true })
  })

  describe('query phase', () => {
    it('returns full derived state', async () => {
      createExecutingFixture(base)
      const result = await handleQuery('phase', base)
      const state = result.data as GSDState

      assert.equal(result.exitCode, 0)
      assert.equal(state.phase, 'executing')
      assert.equal(state.activeMilestone!.id, 'M001')
      assert.equal(state.activeSlice!.id, 'S01')
      assert.equal(state.activeTask!.id, 'T01')
      assert.ok(Array.isArray(state.registry))
      assert.ok(state.progress)
    })

    it('returns pre-planning when no milestones exist', async () => {
      const result = await handleQuery('phase', base)
      const state = result.data as GSDState

      assert.equal(result.exitCode, 0)
      assert.equal(state.phase, 'pre-planning')
      assert.equal(state.activeMilestone, null)
    })
  })

  describe('query cost', () => {
    it('returns aggregated parallel worker costs', async () => {
      writeParallelStatus(base, 'M001', 1.50)
      writeParallelStatus(base, 'M002', 2.75)
      const result = await handleQuery('cost', base)
      const costs = result.data as CostSummary

      assert.equal(result.exitCode, 0)
      assert.equal(costs.workers.length, 2)
      assert.equal(costs.total, 4.25)
      assert.ok(costs.workers.some(w => w.milestoneId === 'M001' && w.cost === 1.50))
      assert.ok(costs.workers.some(w => w.milestoneId === 'M002' && w.cost === 2.75))
    })

    it('returns empty costs when no parallel workers', async () => {
      const result = await handleQuery('cost', base)
      const costs = result.data as CostSummary

      assert.equal(result.exitCode, 0)
      assert.equal(costs.workers.length, 0)
      assert.equal(costs.total, 0)
    })
  })

  describe('query progress', () => {
    it('returns progress and registry subset', async () => {
      createExecutingFixture(base)
      const result = await handleQuery('progress', base)
      const data = result.data as { progress: GSDState['progress']; registry: GSDState['registry'] }

      assert.equal(result.exitCode, 0)
      assert.ok(data.progress)
      assert.ok(data.progress!.milestones)
      assert.ok(Array.isArray(data.registry))
      assert.equal(data.registry[0].id, 'M001')
    })
  })

  describe('query next', () => {
    it('returns dispatch preview for executing phase', async () => {
      createExecutingFixture(base)
      const result = await handleQuery('next', base)
      const next = result.data as NextUnitPreview

      assert.equal(result.exitCode, 0)
      assert.equal(next.action, 'dispatch')
      assert.equal(next.phase, 'executing')
      assert.equal(next.unitType, 'execute-task')
      assert.ok(next.unitId)
    })

    it('returns stop when no active milestone', async () => {
      const result = await handleQuery('next', base)
      const next = result.data as NextUnitPreview

      assert.equal(result.exitCode, 0)
      assert.equal(next.action, 'stop')
      assert.ok(next.reason)
    })
  })

  describe('invalid targets', () => {
    it('returns exit code 1 for unknown target', async () => {
      const result = await handleQuery('bogus', base)
      assert.equal(result.exitCode, 1)
      assert.equal(result.data, undefined)
    })

    it('returns exit code 1 when no target provided', async () => {
      const result = await handleQuery(undefined, base)
      assert.equal(result.exitCode, 1)
      assert.equal(result.data, undefined)
    })
  })
})
