/**
 * GSD Command — /gsd map-codebase
 *
 * Runs codebase analysis and produces structured documents in .gsd/codebase/.
 * Supports focused analysis: tech, arch, quality, concerns.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { gsdRoot } from "./paths.js";
import { loadPrompt } from "./prompt-loader.js";

const FOCUS_AREAS = ["tech", "arch", "quality", "concerns"] as const;
type FocusArea = typeof FOCUS_AREAS[number];

const FOCUS_DESCRIPTIONS: Record<FocusArea, string> = {
  tech: "Technology stack: languages, frameworks, build tools, dependencies, and runtime environment",
  arch: "Architecture patterns: module structure, data flow, design patterns, coupling, and boundaries",
  quality: "Code quality: test coverage, linting, type safety, documentation, and technical debt",
  concerns: "Risk areas: security vulnerabilities, performance bottlenecks, fragility, and maintenance burden",
};

export async function handleMapCodebase(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const basePath = process.cwd();
  const focus = args.trim().toLowerCase() as FocusArea;

  const targets: FocusArea[] = FOCUS_AREAS.includes(focus)
    ? [focus]
    : [...FOCUS_AREAS];

  // Ensure output directory
  const outDir = join(gsdRoot(basePath), "codebase");
  mkdirSync(outDir, { recursive: true });

  ctx.ui.notify(
    `Mapping codebase: ${targets.join(", ")}...\nOutput: ${outDir}/`,
    "info",
  );

  // Dispatch analysis
  try {
    const prompt = loadPrompt("map-codebase", {
      focusAreas: targets.join(", "),
      focusDescriptions: targets.map((a) => `- **${a.toUpperCase()}**: ${FOCUS_DESCRIPTIONS[a]}`).join("\n"),
      outputDirectory: outDir,
      workingDirectory: basePath,
    });

    pi.sendMessage(
      { customType: "gsd-map-codebase", content: prompt, display: false },
      { triggerTurn: true },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to dispatch codebase analysis: ${msg}`, "error");
  }
}
