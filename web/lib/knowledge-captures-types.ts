// Browser-safe TypeScript interfaces for knowledge and captures panels.
// Mirrors upstream types from src/resources/extensions/gsd/captures.ts
// and defines the parsed shape of KNOWLEDGE.md entries.
// Do NOT import from those modules directly — they use Node.js APIs
// unavailable in the browser.

// ─── Knowledge ────────────────────────────────────────────────────────────────

/** A single parsed entry from KNOWLEDGE.md */
export interface KnowledgeEntry {
  /** e.g. "K001" for table rows, "freeform-1" for headings */
  id: string
  /** heading text or table rule text */
  title: string
  /** prose body or table row details */
  content: string
  /** entry type inferred from format/prefix */
  type: "rule" | "pattern" | "lesson" | "freeform"
}

export interface KnowledgeData {
  entries: KnowledgeEntry[]
  /** absolute path to KNOWLEDGE.md */
  filePath: string
  /** ISO timestamp of file mtime, null if file missing */
  lastModified: string | null
}

// ─── Captures ─────────────────────────────────────────────────────────────────

export type Classification = "quick-task" | "inject" | "defer" | "replan" | "note"

export interface CaptureEntry {
  id: string
  text: string
  timestamp: string
  status: "pending" | "triaged" | "resolved"
  classification?: Classification
  resolution?: string
  rationale?: string
  resolvedAt?: string
  executed?: boolean
}

export interface CapturesData {
  entries: CaptureEntry[]
  pendingCount: number
  actionableCount: number
}

export interface CaptureResolveRequest {
  captureId: string
  classification: Classification
  resolution: string
  rationale: string
}

export interface CaptureResolveResult {
  ok: boolean
  captureId: string
  error?: string
}
