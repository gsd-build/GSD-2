// Old .planning directory parser orchestrator
// Walks a .planning directory tree, delegates to per-file parsers,
// and assembles the complete typed PlanningProject.
// Zero Pi dependencies — uses only Node built-ins + local parsers.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

import {
  parseOldRoadmap,
  parseOldPlan,
  parseOldSummary,
  parseOldRequirements,
  parseOldProject,
  parseOldState,
  parseOldConfig,
} from './parsers.js';
import { validatePlanningDirectory } from './validator.js';

import type {
  PlanningProject,
  PlanningPhase,
  PlanningQuickTask,
  PlanningMilestone,
  PlanningResearch,
  PlanningPhaseFile,
} from './types.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Read a file, returning null if it doesn't exist. */
function readOptional(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

/** List directory entries (names only), returning [] if dir doesn't exist. */
function listDir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

/** Check if a path is a directory. */
function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Extract phase number and slug from a directory name like "29-auth-system" or "01.2-setup". */
function parsePhaseDir(dirName: string): { number: number; slug: string } | null {
  const match = dirName.match(/^(\d+(?:\.\d+)?)-(.+)$/);
  if (!match) return null;
  return { number: parseFloat(match[1]), slug: match[2] };
}

/** Extract quick task number and slug from a directory name like "001-fix-login". */
function parseQuickDir(dirName: string): { number: number; slug: string } | null {
  const match = dirName.match(/^(\d+)-(.+)$/);
  if (!match) return null;
  return { number: parseInt(match[1], 10), slug: match[2] };
}

// ─── Phase Scanner ─────────────────────────────────────────────────────────

/** Plan file pattern: NN-NN-PLAN.md (e.g. 29-01-PLAN.md) */
const PLAN_RE = /^(\d+(?:\.\d+)?)-(\d+)-PLAN\.md$/i;

/** Summary file pattern: NN-NN-SUMMARY.md (e.g. 29-01-SUMMARY.md) */
const SUMMARY_RE = /^(\d+(?:\.\d+)?)-(\d+)-SUMMARY\.md$/i;

/** Research file pattern: contains RESEARCH (case-insensitive) */
const RESEARCH_RE = /research/i;

/** Verification file pattern: contains VERIFICATION (case-insensitive) */
const VERIFICATION_RE = /verification/i;

function scanPhaseDirectory(phaseDir: string, dirName: string, parsed: ReturnType<typeof parsePhaseDir>): PlanningPhase {
  const phase: PlanningPhase = {
    dirName,
    number: parsed!.number,
    slug: parsed!.slug,
    plans: {},
    summaries: {},
    research: [],
    verifications: [],
    extraFiles: [],
  };

  const entries = listDir(phaseDir);

  for (const entry of entries) {
    const entryPath = join(phaseDir, entry);

    // Skip directories within phase dirs
    if (isDir(entryPath)) continue;

    const planMatch = entry.match(PLAN_RE);
    if (planMatch) {
      const planNumber = planMatch[2];
      const content = readFileSync(entryPath, 'utf-8');
      phase.plans[planNumber] = parseOldPlan(content, entry, planNumber);
      continue;
    }

    const summaryMatch = entry.match(SUMMARY_RE);
    if (summaryMatch) {
      const planNumber = summaryMatch[2];
      const content = readFileSync(entryPath, 'utf-8');
      phase.summaries[planNumber] = parseOldSummary(content, entry, planNumber);
      continue;
    }

    if (VERIFICATION_RE.test(entry)) {
      const content = readFileSync(entryPath, 'utf-8');
      phase.verifications.push({ fileName: entry, content });
      continue;
    }

    if (RESEARCH_RE.test(entry)) {
      const content = readFileSync(entryPath, 'utf-8');
      phase.research.push({ fileName: entry, content });
      continue;
    }

    // Everything else is an extra file
    const content = readFileSync(entryPath, 'utf-8');
    phase.extraFiles.push({ fileName: entry, content });
  }

  return phase;
}

// ─── Quick Task Scanner ────────────────────────────────────────────────────

function scanQuickDirectory(quickDir: string): PlanningQuickTask[] {
  const tasks: PlanningQuickTask[] = [];
  const entries = listDir(quickDir).sort();

  for (const dirName of entries) {
    const dirPath = join(quickDir, dirName);
    if (!isDir(dirPath)) continue;

    const parsed = parseQuickDir(dirName);
    if (!parsed) continue;

    // Look for NNN-PLAN.md and NNN-SUMMARY.md
    const files = listDir(dirPath);
    let plan: string | null = null;
    let summary: string | null = null;

    for (const file of files) {
      if (/^\d+-PLAN\.md$/i.test(file)) {
        plan = readFileSync(join(dirPath, file), 'utf-8');
      } else if (/^\d+-SUMMARY\.md$/i.test(file)) {
        summary = readFileSync(join(dirPath, file), 'utf-8');
      }
    }

    tasks.push({
      dirName,
      number: parsed.number,
      slug: parsed.slug,
      plan,
      summary,
    });
  }

  return tasks;
}

// ─── Milestones Scanner ────────────────────────────────────────────────────

function scanMilestonesDirectory(msDir: string): PlanningMilestone[] {
  const entries = listDir(msDir);
  if (entries.length === 0) return [];

  // Group files by milestone ID prefix (e.g. "v2.2" from "v2.2-ROADMAP.md")
  const grouped = new Map<string, { requirements: string | null; roadmap: string | null; extraFiles: PlanningPhaseFile[] }>();

  for (const entry of entries) {
    const entryPath = join(msDir, entry);
    if (isDir(entryPath)) continue;

    // Extract milestone ID: everything before the first dash-followed-by-uppercase or common suffix
    const idMatch = entry.match(/^(.+?)-(ROADMAP|REQUIREMENTS|SUMMARY)\.md$/i);
    if (idMatch) {
      const id = idMatch[1];
      const type = idMatch[2].toUpperCase();
      if (!grouped.has(id)) grouped.set(id, { requirements: null, roadmap: null, extraFiles: [] });
      const ms = grouped.get(id)!;
      const content = readFileSync(entryPath, 'utf-8');

      if (type === 'REQUIREMENTS') ms.requirements = content;
      else if (type === 'ROADMAP') ms.roadmap = content;
      else ms.extraFiles.push({ fileName: entry, content });
    } else {
      // Non-standard file — try to extract ID from filename
      const simpleMatch = entry.match(/^(.+?)\./);
      const id = simpleMatch ? simpleMatch[1] : entry;
      if (!grouped.has(id)) grouped.set(id, { requirements: null, roadmap: null, extraFiles: [] });
      const content = readFileSync(entryPath, 'utf-8');
      grouped.get(id)!.extraFiles.push({ fileName: entry, content });
    }
  }

  return Array.from(grouped.entries()).map(([id, data]) => ({
    id,
    requirements: data.requirements,
    roadmap: data.roadmap,
    extraFiles: data.extraFiles,
  }));
}

// ─── Research Scanner ──────────────────────────────────────────────────────

function scanResearchDirectory(researchDir: string): PlanningResearch[] {
  const entries = listDir(researchDir);
  const research: PlanningResearch[] = [];

  for (const entry of entries) {
    const entryPath = join(researchDir, entry);
    if (isDir(entryPath)) continue;
    const content = readFileSync(entryPath, 'utf-8');
    research.push({ fileName: entry, content });
  }

  return research;
}

// ─── Main Orchestrator ─────────────────────────────────────────────────────

/**
 * Parse an old .planning directory into a complete typed PlanningProject.
 *
 * Handles:
 * - Top-level files: PROJECT.md, ROADMAP.md, REQUIREMENTS.md, STATE.md, config.json
 * - Phase directories with plans, summaries, research, verification, extras
 * - Duplicate phase numbers (full directory name as key)
 * - .archive/ skipping
 * - Orphan summaries (summaries without matching plans)
 * - Quick tasks from quick/ directory
 * - Milestones from milestones/ directory
 * - Research from research/ directory
 *
 * Missing files produce null values, not thrown errors.
 * Use validatePlanningDirectory() for pre-flight structural checks.
 */
export async function parsePlanningDirectory(path: string): Promise<PlanningProject> {
  // Run validation first
  const validation = await validatePlanningDirectory(path);

  // Parse top-level files
  const projectContent = readOptional(join(path, 'PROJECT.md'));
  const project = projectContent !== null ? parseOldProject(projectContent) : null;

  const roadmapContent = readOptional(join(path, 'ROADMAP.md'));
  const roadmap = roadmapContent !== null ? parseOldRoadmap(roadmapContent) : null;

  const reqContent = readOptional(join(path, 'REQUIREMENTS.md'));
  const requirements = reqContent !== null ? parseOldRequirements(reqContent) : [];

  const stateContent = readOptional(join(path, 'STATE.md'));
  const state = stateContent !== null ? parseOldState(stateContent) : null;

  const configContent = readOptional(join(path, 'config.json'));
  const config = configContent !== null ? parseOldConfig(configContent) : null;

  // Scan phases/ directory
  const phases: Record<string, PlanningPhase> = {};
  const phasesDir = join(path, 'phases');

  if (isDir(phasesDir)) {
    const phaseDirs = listDir(phasesDir).sort();

    for (const dirName of phaseDirs) {
      // Skip .archive and hidden directories
      if (dirName.startsWith('.')) continue;

      const dirPath = join(phasesDir, dirName);
      if (!isDir(dirPath)) continue;

      const parsed = parsePhaseDir(dirName);
      if (!parsed) continue;

      phases[dirName] = scanPhaseDirectory(dirPath, dirName, parsed);
    }
  }

  // Scan quick/ directory
  const quickDir = join(path, 'quick');
  const quickTasks = isDir(quickDir) ? scanQuickDirectory(quickDir) : [];

  // Scan milestones/ directory
  const msDir = join(path, 'milestones');
  const milestones = isDir(msDir) ? scanMilestonesDirectory(msDir) : [];

  // Scan research/ directory
  const researchDir = join(path, 'research');
  const research = isDir(researchDir) ? scanResearchDirectory(researchDir) : [];

  return {
    path,
    project,
    roadmap,
    requirements,
    state,
    config,
    phases,
    quickTasks,
    milestones,
    research,
    validation,
  };
}
