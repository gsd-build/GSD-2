import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { resolveBridgeRuntimeConfig } from "./bridge-service.ts"
import type { KnowledgeEntry, KnowledgeData } from "../../web/lib/knowledge-captures-types.ts"

/**
 * Reads and parses KNOWLEDGE.md directly from disk. No child process needed
 * because KNOWLEDGE.md is a plain markdown file with a deterministic path
 * and no Node ESM .js-extension imports.
 */
export async function collectKnowledgeData(projectCwdOverride?: string): Promise<KnowledgeData> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { projectCwd } = config

  const filePath = join(projectCwd, ".gsd", "KNOWLEDGE.md")

  if (!existsSync(filePath)) {
    return { entries: [], filePath, lastModified: null }
  }

  const content = readFileSync(filePath, "utf-8")
  const stat = statSync(filePath)
  const entries = parseKnowledgeFile(content)

  return {
    entries,
    filePath,
    lastModified: stat.mtime.toISOString(),
  }
}

/**
 * Parse KNOWLEDGE.md content into KnowledgeEntry array.
 *
 * Handles two formats:
 * 1. **Freeform**: `## Title` followed by prose paragraphs
 * 2. **Table**: `## Title` followed by a markdown table with rows matching
 *    `| K001 |`, `| P001 |`, or `| L001 |` patterns
 */
export function parseKnowledgeFile(content: string): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = []
  let freeformCounter = 0

  // Split on ## headings, keeping the heading text
  const sections = content.split(/^## /m)

  for (const section of sections) {
    const trimmed = section.trim()
    if (!trimmed) continue

    // Skip the top-level heading section (# Knowledge Base, # Project Knowledge, etc.)
    if (/^#\s+/m.test(trimmed) && !trimmed.includes("\n## ")) {
      // This is content before the first ## heading — skip if it's just the H1
      const firstLine = trimmed.split("\n")[0]?.trim() ?? ""
      if (firstLine.startsWith("# ")) continue
    }

    // Extract heading (first line) and body (rest)
    const newlineIndex = trimmed.indexOf("\n")
    if (newlineIndex === -1) {
      // Heading-only section with no body — skip
      continue
    }

    const title = trimmed.slice(0, newlineIndex).trim()
    const body = trimmed.slice(newlineIndex + 1).trim()

    if (!title || !body) continue

    // Check for table rows with K/P/L prefixed IDs
    const tableRowRegex = /^\|\s*([KPL]\d{3})\s*\|(.+)\|/gm
    const tableMatches: Array<{ id: string; rest: string }> = []
    let match: RegExpExecArray | null

    while ((match = tableRowRegex.exec(body)) !== null) {
      tableMatches.push({ id: match[1], rest: match[2] })
    }

    if (tableMatches.length > 0) {
      // Table format: parse each row as a structured entry
      for (const row of tableMatches) {
        const prefix = row.id.charAt(0)
        const type: KnowledgeEntry["type"] =
          prefix === "K" ? "rule" : prefix === "P" ? "pattern" : "lesson"

        // Extract columns from the rest of the row
        const columns = row.rest
          .split("|")
          .map((col) => col.trim())
          .filter(Boolean)

        entries.push({
          id: row.id,
          title: columns[0] ?? title,
          content: columns.slice(1).join(" — ") || title,
          type,
        })
      }
    } else {
      // Freeform format: entire section is one entry
      freeformCounter++
      entries.push({
        id: `freeform-${freeformCounter}`,
        title,
        content: body,
        type: "freeform",
      })
    }
  }

  return entries
}
