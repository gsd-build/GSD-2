/**
 * Graph-aware context injection for dispatch prompt builders.
 *
 * Reads the pre-built graph.json and returns a formatted context block
 * for injection into prompts. Gracefully returns null when no graph exists
 * or the query yields no results — callers must handle null.
 */

import { logWarning } from "./workflow-logger.js";
import type { GraphQueryResult, GraphStatusResult } from "@gsd-build/mcp-server";

export interface GraphSubgraphOptions {
  /** Budget in tokens passed to graphQuery (1 node ≈ 20 tokens, 1 edge ≈ 10 tokens) */
  budget: number;
}

/**
 * Query the knowledge graph for nodes related to the given term and format
 * the result as an inlined context block.
 *
 * Returns null when:
 * - @gsd-build/mcp-server fails to import
 * - graph.json does not exist (graphQuery already handles this gracefully)
 * - query returns zero nodes
 *
 * Annotates the block header when the graph is stale (> 24 hours old).
 */
export async function inlineGraphSubgraph(
  projectDir: string,
  term: string,
  opts: GraphSubgraphOptions,
): Promise<string | null> {
  if (!term || !term.trim()) return null;

  try {
    const { graphQuery, graphStatus } = await import("@gsd-build/mcp-server") as {
      graphQuery: (projectDir: string, term: string, budget?: number) => Promise<GraphQueryResult>;
      graphStatus: (projectDir: string) => Promise<GraphStatusResult>;
    };

    const result = await graphQuery(projectDir, term, opts.budget);
    if (result.nodes.length === 0) return null;

    // Check staleness for annotation
    let staleAnnotation = "";
    try {
      const status = await graphStatus(projectDir);
      if (status.exists && status.stale && status.ageHours !== undefined) {
        const hours = Math.round(status.ageHours);
        staleAnnotation = `\n> ⚠ Graph last built ${hours}h ago — context may be outdated`;
      }
    } catch {
      // Non-fatal — skip annotation on error
    }

    // Format nodes as a compact list
    const nodeLines = result.nodes.map((n) => {
      const desc = n.description ? ` — ${n.description}` : "";
      return `- **${n.label}** (\`${n.type}\`, ${n.confidence})${desc}`;
    });

    // Format edges as relations (only if present)
    const edgeLines = result.edges.length > 0
      ? result.edges.map((e) => `- \`${e.from}\` →[${e.type}]→ \`${e.to}\``)
      : [];

    const sections: string[] = [
      `### Knowledge Graph Context (term: "${term}")`,
      `Source: \`.gsd/graphs/graph.json\``,
      staleAnnotation,
      "",
      `**Nodes (${result.nodes.length}):**`,
      ...nodeLines,
    ];

    if (edgeLines.length > 0) {
      sections.push("", `**Relations (${result.edges.length}):**`, ...edgeLines);
    }

    return sections.filter((l) => l !== undefined).join("\n");
  } catch (err) {
    logWarning("prompt", `inlineGraphSubgraph failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
