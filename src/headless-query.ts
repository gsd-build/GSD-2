/**
 * Headless Query Commands — `gsd headless query <target>`
 *
 * Pure read-only commands that inspect GSD state from disk without
 * spawning an LLM session. Returns structured JSON to stdout.
 *
 * Targets:
 *   phase    — full derived state (deriveState output)
 *   cost     — aggregated parallel worker costs
 *   progress — milestone/slice/task progress + registry
 *   next     — dry-run: what unit would be dispatched next
 */

import { deriveState } from './resources/extensions/gsd/state.js'
import { resolveDispatch } from './resources/extensions/gsd/auto-dispatch.js'
import { readAllSessionStatuses } from './resources/extensions/gsd/session-status-io.js'
import { loadEffectiveGSDPreferences } from './resources/extensions/gsd/preferences.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CostSummary {
  workers: Array<{
    milestoneId: string
    pid: number
    state: string
    cost: number
    lastHeartbeat: number
  }>
  total: number
}

export interface NextUnitPreview {
  action: 'dispatch' | 'stop' | 'skip'
  unitType?: string
  unitId?: string
  reason?: string
  phase: string
}

// ─── Query Handlers ─────────────────────────────────────────────────────────

function aggregateParallelCosts(basePath: string): CostSummary {
  const statuses = readAllSessionStatuses(basePath)
  const workers = statuses.map((s) => ({
    milestoneId: s.milestoneId,
    pid: s.pid,
    state: s.state,
    cost: s.cost,
    lastHeartbeat: s.lastHeartbeat,
  }))
  const total = workers.reduce((sum, w) => sum + w.cost, 0)
  return { workers, total }
}

async function deriveNextUnit(basePath: string): Promise<NextUnitPreview> {
  const state = await deriveState(basePath)

  if (!state.activeMilestone) {
    return {
      action: 'stop',
      reason: state.phase === 'complete' ? 'All milestones complete.' : state.nextAction,
      phase: state.phase,
    }
  }

  const loaded = loadEffectiveGSDPreferences()
  const dispatch = await resolveDispatch({
    basePath,
    mid: state.activeMilestone.id,
    midTitle: state.activeMilestone.title,
    state,
    prefs: loaded?.preferences,
  })

  return {
    action: dispatch.action,
    unitType: dispatch.action === 'dispatch' ? dispatch.unitType : undefined,
    unitId: dispatch.action === 'dispatch' ? dispatch.unitId : undefined,
    reason: dispatch.action === 'stop' ? dispatch.reason : undefined,
    phase: state.phase,
  }
}

// ─── Main Handler ───────────────────────────────────────────────────────────

export interface QueryResult {
  exitCode: number
  data?: unknown
}

export async function handleQuery(
  target: string | undefined,
  basePath: string,
): Promise<QueryResult> {
  if (!target) {
    process.stderr.write('Usage: gsd headless query <phase|cost|progress|next>\n')
    return { exitCode: 1 }
  }

  switch (target) {
    case 'phase': {
      const state = await deriveState(basePath)
      process.stdout.write(JSON.stringify(state) + '\n')
      return { exitCode: 0, data: state }
    }
    case 'cost': {
      const costs = aggregateParallelCosts(basePath)
      process.stdout.write(JSON.stringify(costs) + '\n')
      return { exitCode: 0, data: costs }
    }
    case 'progress': {
      const state = await deriveState(basePath)
      const result = { progress: state.progress, registry: state.registry }
      process.stdout.write(JSON.stringify(result) + '\n')
      return { exitCode: 0, data: result }
    }
    case 'next': {
      const next = await deriveNextUnit(basePath)
      process.stdout.write(JSON.stringify(next) + '\n')
      return { exitCode: 0, data: next }
    }
    default:
      process.stderr.write(`Unknown query target: ${target}\nValid targets: phase, cost, progress, next\n`)
      return { exitCode: 1 }
  }
}
