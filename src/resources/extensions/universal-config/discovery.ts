/**
 * Universal Config Discovery — main discovery orchestrator
 *
 * Runs all tool scanners in parallel and aggregates results into a
 * unified DiscoveryResult.
 */

import { homedir } from "node:os";
import { TOOLS } from "./tools.js";
import { SCANNERS } from "./scanners.js";
import type { DiscoveryResult, DiscoveredItem, ToolDiscoveryResult } from "./types.js";

/** Inline concurrency limiter to cap parallel async operations. */
function pLimit(concurrency: number) {
  const queue: (() => void)[] = [];
  let active = 0;
  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(resolve, reject).finally(() => {
          active--;
          if (queue.length > 0) queue.shift()!();
        });
      };
      if (active < concurrency) run();
      else queue.push(run);
    });
  };
}

/**
 * Run universal config discovery across all supported AI coding tools.
 *
 * @param projectRoot - Absolute path to the project root (cwd)
 * @param home - Home directory override (defaults to os.homedir())
 * @returns Aggregated discovery result
 */
export async function discoverAllConfigs(
  projectRoot: string,
  home: string = homedir(),
): Promise<DiscoveryResult> {
  const start = Date.now();
  const allWarnings: string[] = [];
  const toolResults: ToolDiscoveryResult[] = [];

  // Run scanners with bounded concurrency to avoid memory spikes
  const limit = pLimit(5);
  const results = await Promise.allSettled(
    TOOLS.map((tool) =>
      limit(async () => {
        const scanner = SCANNERS[tool.id];
        if (!scanner) return { tool, items: [] as DiscoveredItem[], warnings: [`No scanner for ${tool.id}`] };
        try {
          const { items, warnings } = await scanner(projectRoot, home, tool);
          return { tool, items, warnings };
        } catch (err) {
          return {
            tool,
            items: [] as DiscoveredItem[],
            warnings: [`Scanner error for ${tool.name}: ${err instanceof Error ? err.message : String(err)}`],
          };
        }
      }),
    ),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      toolResults.push(result.value);
      allWarnings.push(...result.value.warnings);
    } else {
      allWarnings.push(`Scanner failed: ${result.reason}`);
    }
  }

  const allItems = toolResults.flatMap((r) => r.items);

  const mcpServers = allItems.filter((i) => i.type === "mcp-server").length;
  const rules = allItems.filter((i) => i.type === "rule").length;
  const contextFiles = allItems.filter((i) => i.type === "context-file").length;
  const settings = allItems.filter((i) => i.type === "settings").length;
  const claudeSkills = allItems.filter((i) => i.type === "claude-skill").length;
  const claudePlugins = allItems.filter((i) => i.type === "claude-plugin").length;
  const toolsWithConfig = toolResults.filter((r) => r.items.length > 0).length;

  return {
    tools: toolResults,
    allItems,
    summary: {
      mcpServers,
      rules,
      contextFiles,
      settings,
      claudeSkills,
      claudePlugins,
      totalItems: allItems.length,
      toolsScanned: TOOLS.length,
      toolsWithConfig,
    },
    warnings: allWarnings,
    durationMs: Date.now() - start,
  };
}
