// GSD Visualizer - Changelog view renderer

import type { Theme } from "@gsd/pi-coding-agent";
import { truncateToWidth } from "@gsd/pi-tui";
import type { VisualizerData } from "./visualizer-data.js";
import { STATUS_GLYPH, STATUS_COLOR } from "../shared/mod.js";
import { findVerification } from "./visualizer-formatters.js";

export function renderChangelogView(
  data: VisualizerData,
  th: Theme,
  width: number,
): string[] {
  const lines: string[] = [];
  const changelog = data.changelog;

  if (changelog.entries.length === 0) {
    lines.push(th.fg("dim", "No completed slices yet."));
    return lines;
  }

  lines.push(th.fg("accent", th.bold("Changes")));
  lines.push("");

  for (const entry of changelog.entries) {
    const header = `${entry.milestoneId}/${entry.sliceId}: ${entry.title}`;
    lines.push(th.fg("success", header));

    if (entry.oneLiner) {
      lines.push(`  "${th.fg("text", entry.oneLiner)}"`);
    }

    if (entry.filesModified.length > 0) {
      lines.push("  Files:");
      for (const f of entry.filesModified) {
        lines.push(
          truncateToWidth(
            `    ${th.fg(STATUS_COLOR.done, STATUS_GLYPH.done)} ${f.path} \u2014 ${f.description}`,
            width,
          ),
        );
      }
    }

    // Decisions and patterns from slice verification
    const ver = findVerification(data, entry.milestoneId, entry.sliceId);
    if (ver) {
      if (ver.keyDecisions.length > 0) {
        lines.push("  Decisions:");
        for (const d of ver.keyDecisions) {
          lines.push(`    - ${d}`);
        }
      }
      if (ver.patternsEstablished.length > 0) {
        lines.push("  Patterns:");
        for (const p of ver.patternsEstablished) {
          lines.push(`    - ${p}`);
        }
      }
    }

    if (entry.completedAt) {
      lines.push(th.fg("dim", `  Completed: ${entry.completedAt}`));
    }

    lines.push("");
  }

  return lines;
}
