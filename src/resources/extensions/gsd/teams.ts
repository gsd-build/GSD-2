/**
 * GSD Teams — Team discovery, definition, and task routing.
 *
 * Teams provide semantic grouping of agents with domain-specific routing.
 * Team definitions are loaded from .gsd/teams/*.yaml, .pi/teams/*.yaml,
 * or inline in preferences.yaml.
 *
 * Follows the discovery pattern from subagent/agents.ts.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  mkdirSync,
} from "node:fs";
import { join, extname } from "node:path";
import { gsdRoot } from "./paths.js";
import type { TeamDefinition, TeamMember, TeamAssignment } from "./types.js";

// ─── Constants ────────────────────────────────────────────────────────────

const TEAMS_DIR = "teams";
const YAML_EXTENSIONS = new Set([".yaml", ".yml"]);

// ─── YAML Parsing (minimal, no external dep) ─────────────────────────────

/**
 * Minimal YAML parser for team definitions.
 * Handles the subset of YAML used in team configs (flat keys, arrays, nested objects).
 * Falls back to JSON.parse if content looks like JSON.
 */
function parseTeamYaml(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) {
    try { return JSON.parse(trimmed); } catch { return null; }
  }

  // Minimal YAML parsing for flat structures
  const result: Record<string, unknown> = {};
  const lines = trimmed.split("\n");
  let currentKey = "";
  let currentArray: unknown[] | null = null;
  let currentArrayKey = "";

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.trim().startsWith("#") || !line.trim()) continue;

    // Array item
    const arrayMatch = line.match(/^\s+-\s+(.*)/);
    if (arrayMatch && currentArrayKey) {
      const value = arrayMatch[1].trim();
      // Check if it's a nested object in array
      if (value.includes(":")) {
        const obj: Record<string, string> = {};
        // Parse "key: value" from the line
        const parts = value.split(":");
        obj[parts[0].trim()] = parts.slice(1).join(":").trim().replace(/^["']|["']$/g, "");
        if (currentArray) currentArray.push(obj);
      } else {
        if (currentArray) currentArray.push(value.replace(/^["']|["']$/g, ""));
      }
      continue;
    }

    // Inline array like: filePatterns: ["a", "b"]
    const inlineArrayMatch = line.match(/^(\w+):\s*\[(.+)\]\s*$/);
    if (inlineArrayMatch) {
      const key = inlineArrayMatch[1].trim();
      const items = inlineArrayMatch[2].split(",").map(s =>
        s.trim().replace(/^["']|["']$/g, "")
      );
      result[key] = items;
      currentArrayKey = "";
      currentArray = null;
      continue;
    }

    // Key: value
    const kvMatch = line.match(/^(\w+):\s*(.*)/);
    if (kvMatch) {
      // Save previous array if any
      if (currentArray && currentArrayKey) {
        result[currentArrayKey] = currentArray;
      }

      const key = kvMatch[1].trim();
      const value = kvMatch[2].trim();

      if (value === "" || value === "[]") {
        // Start of array or empty value
        currentArrayKey = key;
        currentArray = [];
        currentKey = key;
      } else {
        result[key] = value.replace(/^["']|["']$/g, "");
        currentArrayKey = "";
        currentArray = null;
        currentKey = key;
      }
    }
  }

  // Save last array
  if (currentArray && currentArrayKey) {
    result[currentArrayKey] = currentArray;
  }

  return Object.keys(result).length > 0 ? result : null;
}

function parseTeamFromYaml(content: string): TeamDefinition | null {
  const data = parseTeamYaml(content);
  if (!data || typeof data.name !== "string") return null;

  return {
    name: data.name as string,
    description: (data.description as string) ?? "",
    members: Array.isArray(data.members)
      ? (data.members as Array<Record<string, string>>).map(m => ({
          agent: m.agent ?? "",
          role: m.role,
          filePatterns: m.filePatterns ? [m.filePatterns] : undefined,
        } as TeamMember))
      : [],
    filePatterns: Array.isArray(data.filePatterns) ? data.filePatterns as string[] : [],
    capabilities: Array.isArray(data.capabilities) ? data.capabilities as string[] : [],
    model: typeof data.model === "string" ? data.model : undefined,
    tools: Array.isArray(data.tools) ? data.tools as string[] : undefined,
    maxConcurrency: typeof data.maxConcurrency === "string"
      ? parseInt(data.maxConcurrency, 10) || undefined
      : typeof data.maxConcurrency === "number" ? data.maxConcurrency : undefined,
  };
}

// ─── Discovery ────────────────────────────────────────────────────────────

function teamsDir(basePath: string): string {
  return join(gsdRoot(basePath), TEAMS_DIR);
}

function userTeamsDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  return join(home, ".gsd", TEAMS_DIR);
}

function projectTeamsDir(basePath: string): string {
  return join(basePath, ".pi", TEAMS_DIR);
}

function loadTeamsFromDir(dir: string): TeamDefinition[] {
  if (!existsSync(dir)) return [];
  const teams: TeamDefinition[] = [];

  try {
    for (const entry of readdirSync(dir)) {
      if (!YAML_EXTENSIONS.has(extname(entry))) continue;
      try {
        const content = readFileSync(join(dir, entry), "utf-8");
        const team = parseTeamFromYaml(content);
        if (team) teams.push(team);
      } catch { /* skip invalid files */ }
    }
  } catch { /* non-fatal */ }

  return teams;
}

/**
 * Discover team definitions from multiple sources.
 * Priority: project .gsd/teams/ > project .pi/teams/ > user ~/.gsd/teams/
 * Later entries with same name override earlier ones.
 */
export function discoverTeams(basePath: string): TeamDefinition[] {
  const teamMap = new Map<string, TeamDefinition>();

  // User-level teams (lowest priority)
  for (const team of loadTeamsFromDir(userTeamsDir())) {
    teamMap.set(team.name, team);
  }

  // Project-level .pi/teams/
  for (const team of loadTeamsFromDir(projectTeamsDir(basePath))) {
    teamMap.set(team.name, team);
  }

  // Project-level .gsd/teams/ (highest priority)
  for (const team of loadTeamsFromDir(teamsDir(basePath))) {
    teamMap.set(team.name, team);
  }

  return [...teamMap.values()];
}

// ─── Routing ──────────────────────────────────────────────────────────────

/**
 * Match a set of files against a team's file patterns using simple glob matching.
 * Returns the fraction of files that match (0.0 - 1.0).
 */
function matchFilePatterns(files: string[], patterns: string[]): { score: number; matched: string[] } {
  if (files.length === 0 || patterns.length === 0) return { score: 0, matched: [] };

  const matched: string[] = [];
  for (const file of files) {
    for (const pattern of patterns) {
      if (simpleGlobMatch(file, pattern)) {
        matched.push(file);
        break;
      }
    }
  }

  return { score: matched.length / files.length, matched };
}

/**
 * Simple glob matching supporting ** and * wildcards.
 */
function simpleGlobMatch(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexStr = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "<<<DOUBLESTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<DOUBLESTAR>>>/g, ".*");

  try {
    return new RegExp(`^${regexStr}$`).test(path);
  } catch {
    return false;
  }
}

/**
 * Match capability keywords against a description text.
 * Returns matched capabilities.
 */
function matchCapabilities(description: string, capabilities: string[]): string[] {
  const lower = description.toLowerCase();
  return capabilities.filter(cap => lower.includes(cap.toLowerCase()));
}

/**
 * Resolve the best team for a task based on file patterns and capabilities.
 * Returns null if no team scores above the threshold (0.3).
 */
export function resolveTeamForFiles(
  teams: TeamDefinition[],
  files: string[],
  description?: string,
): TeamAssignment | null {
  if (teams.length === 0) return null;

  let best: TeamAssignment | null = null;
  let bestScore = 0;
  const THRESHOLD = 0.3;

  for (const team of teams) {
    const { score, matched } = matchFilePatterns(files, team.filePatterns);
    const matchedCapabilities = description
      ? matchCapabilities(description, team.capabilities)
      : [];

    // Combine file score (70% weight) and capability score (30% weight)
    const capScore = team.capabilities.length > 0
      ? matchedCapabilities.length / team.capabilities.length
      : 0;
    const combinedScore = score * 0.7 + capScore * 0.3;

    if (combinedScore > bestScore && combinedScore >= THRESHOLD) {
      bestScore = combinedScore;
      best = {
        teamName: team.name,
        confidence: combinedScore,
        matchedPatterns: matched,
        matchedCapabilities,
      };
    }
  }

  return best;
}

/**
 * Resolve the best team for a task.
 * Uses TaskPlanEntry.files for matching.
 */
export function resolveTeamForTask(
  teams: TeamDefinition[],
  taskFiles: string[],
  taskDescription?: string,
): TeamAssignment | null {
  return resolveTeamForFiles(teams, taskFiles, taskDescription);
}

/**
 * Resolve the best team for a slice.
 * Uses SlicePlan.filesLikelyTouched for matching.
 */
export function resolveTeamForSlice(
  teams: TeamDefinition[],
  filesLikelyTouched: string[],
  sliceTitle?: string,
): TeamAssignment | null {
  return resolveTeamForFiles(teams, filesLikelyTouched, sliceTitle);
}

/**
 * Get the primary agent from a team, optionally filtered by role.
 */
export function getTeamAgent(
  team: TeamDefinition,
  role?: string,
): TeamMember | null {
  if (team.members.length === 0) return null;
  if (role) {
    const member = team.members.find(m => m.role === role);
    if (member) return member;
  }
  return team.members[0];
}
