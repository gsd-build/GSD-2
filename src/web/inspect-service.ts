import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { resolveBridgeRuntimeConfig } from "./bridge-service.ts"
import type { InspectData } from "../../web/lib/remaining-command-types.ts"

/**
 * Collects project inspection data by reading gsd-db.json directly.
 * No child process needed — gsd-db.json is plain JSON with no .js imports.
 */
export async function collectInspectData(projectCwdOverride?: string): Promise<InspectData> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { projectCwd } = config

  const gsdDir = join(projectCwd, ".gsd")
  const dbPath = join(gsdDir, "gsd-db.json")

  let schemaVersion: number | null = null
  let decisions: Array<{ id: string; decision: string; choice: string; [k: string]: unknown }> = []
  let requirements: Array<{
    id: string
    status: string
    description: string
    [k: string]: unknown
  }> = []
  let artifacts: unknown[] = []

  if (existsSync(dbPath)) {
    try {
      const db = JSON.parse(readFileSync(dbPath, "utf-8"))
      schemaVersion = db.schema_version ?? null
      decisions = db.decisions || []
      requirements = db.requirements || []
      artifacts = db.artifacts || []
    } catch {
      // Corrupt or unreadable — return empty state
    }
  }

  return {
    schemaVersion,
    counts: {
      decisions: decisions.length,
      requirements: requirements.length,
      artifacts: artifacts.length,
    },
    recentDecisions: decisions
      .slice(-5)
      .reverse()
      .map((d) => ({ id: d.id, decision: d.decision, choice: d.choice })),
    recentRequirements: requirements
      .slice(-5)
      .reverse()
      .map((r) => ({ id: r.id, status: r.status, description: r.description })),
  }
}
