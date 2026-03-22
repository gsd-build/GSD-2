// Browser-safe TypeScript interfaces for remaining GSD command surfaces.
// Mirrors upstream types from src/resources/extensions/gsd/ modules:
//   metrics.ts, commands.ts, types.ts, undo, cleanup, export, steer
// Do NOT import from those modules directly — they use Node.js APIs
// unavailable in the browser.

// ─── History (mirrors metrics.ts: TokenCounts, UnitMetrics, aggregates, ProjectTotals) ──

export interface HistoryTokenCounts {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}

export interface HistoryUnitMetrics {
  type: string
  id: string
  model: string
  startedAt: number
  finishedAt: number
  tokens: HistoryTokenCounts
  cost: number
  toolCalls: number
  assistantMessages: number
  userMessages: number
  tier?: string
  modelDowngraded?: boolean
  skills?: string[]
}

export interface HistoryPhaseAggregate {
  phase: string
  units: number
  tokens: HistoryTokenCounts
  cost: number
  duration: number
}

export interface HistorySliceAggregate {
  sliceId: string
  units: number
  tokens: HistoryTokenCounts
  cost: number
  duration: number
}

export interface HistoryModelAggregate {
  model: string
  units: number
  tokens: HistoryTokenCounts
  cost: number
  contextWindowTokens?: number
}

export interface HistoryProjectTotals {
  units: number
  tokens: HistoryTokenCounts
  cost: number
  duration: number
  toolCalls: number
  assistantMessages: number
  userMessages: number
  totalTruncationSections: number
  continueHereFiredCount: number
}

export interface HistoryData {
  units: HistoryUnitMetrics[]
  totals: HistoryProjectTotals
  byPhase: HistoryPhaseAggregate[]
  bySlice: HistorySliceAggregate[]
  byModel: HistoryModelAggregate[]
}

// ─── Inspect (mirrors commands.ts InspectData) ───────────────────────────────

export interface InspectData {
  schemaVersion: number | null
  counts: { decisions: number; requirements: number; artifacts: number }
  recentDecisions: Array<{ id: string; decision: string; choice: string }>
  recentRequirements: Array<{ id: string; status: string; description: string }>
}

// ─── Hooks (mirrors types.ts HookStatusEntry) ───────────────────────────────

export interface HookStatusEntry {
  name: string
  type: "post" | "pre"
  enabled: boolean
  targets: string[]
  activeCycles: Record<string, number>
}

export interface HooksData {
  entries: HookStatusEntry[]
  formattedStatus: string
}

// ─── Export ──────────────────────────────────────────────────────────────────

export interface ExportResult {
  content: string
  format: "markdown" | "json"
  filename: string
}

// ─── Undo ───────────────────────────────────────────────────────────────────

export interface UndoInfo {
  lastUnitType: string | null
  lastUnitId: string | null
  lastUnitKey: string | null
  completedCount: number
  commits: string[]
}

export interface UndoResult {
  success: boolean
  message: string
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

export interface CleanupBranch {
  name: string
  merged: boolean
}

export interface CleanupSnapshot {
  ref: string
  date: string
}

export interface CleanupData {
  branches: CleanupBranch[]
  snapshots: CleanupSnapshot[]
}

export interface CleanupResult {
  deletedBranches: number
  prunedSnapshots: number
  message: string
}

// ─── Steer ──────────────────────────────────────────────────────────────────

export interface SteerData {
  overridesContent: string | null
}
