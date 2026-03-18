/**
 * Custom Workflow Loader — discovery, resolution, listing, and install.
 *
 * Discovers workflow definition files from multiple locations:
 * 1. `.gsd/workflows/*.md` (project-local)
 * 2. `~/.gsd/workflows/*.md` (user global)
 *
 * Provides resolution by name and listing for the `/gsd workflows` command.
 */

import { existsSync, readdirSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { parseWorkflowDefinition, type WorkflowDefinition } from "./workflow-definition.js";

// ─── Discovery ────────────────────────────────────────────────────────────

export interface WorkflowEntry {
  name: string;
  description: string;
  source: "project" | "global";
  path: string;
}

/**
 * Discover all available workflows from project and global locations.
 * Project workflows take precedence over global workflows with the same name.
 */
export function listWorkflows(basePath: string): WorkflowEntry[] {
  const entries = new Map<string, WorkflowEntry>();

  // Global workflows (lower priority)
  const globalDir = join(homedir(), ".gsd", "workflows");
  for (const entry of scanWorkflowDir(globalDir, "global")) {
    entries.set(entry.name.toLowerCase(), entry);
  }

  // Project workflows (higher priority, overwrites global)
  const projectDir = join(basePath, ".gsd", "workflows");
  for (const entry of scanWorkflowDir(projectDir, "project")) {
    entries.set(entry.name.toLowerCase(), entry);
  }

  return Array.from(entries.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function scanWorkflowDir(dir: string, source: "project" | "global"): WorkflowEntry[] {
  if (!existsSync(dir)) return [];

  const entries: WorkflowEntry[] = [];
  try {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".md")) continue;
      const filePath = join(dir, file);
      try {
        const content = readFileSync(filePath, "utf-8");
        const def = parseWorkflowDefinition(content);
        if (def) {
          entries.push({
            name: def.name,
            description: def.description,
            source,
            path: filePath,
          });
        }
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Directory read error
  }

  return entries;
}

// ─── Resolution ───────────────────────────────────────────────────────────

/**
 * Resolve a workflow by name or file path.
 *
 * Lookup order:
 * 1. If `nameOrPath` is a file path that exists, parse it directly
 * 2. Search project-local `.gsd/workflows/`
 * 3. Search global `~/.gsd/workflows/`
 */
export function resolveWorkflow(nameOrPath: string, basePath: string): WorkflowDefinition | null {
  // Direct path
  if (nameOrPath.endsWith(".md") && existsSync(nameOrPath)) {
    return loadWorkflowFile(nameOrPath);
  }

  // Search by name
  const nameLower = nameOrPath.toLowerCase();

  // Project-local first
  const projectDir = join(basePath, ".gsd", "workflows");
  const projectResult = findWorkflowByName(projectDir, nameLower);
  if (projectResult) return projectResult;

  // Global
  const globalDir = join(homedir(), ".gsd", "workflows");
  return findWorkflowByName(globalDir, nameLower);
}

function findWorkflowByName(dir: string, nameLower: string): WorkflowDefinition | null {
  if (!existsSync(dir)) return null;

  try {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".md")) continue;
      const def = loadWorkflowFile(join(dir, file));
      if (def && def.name.toLowerCase() === nameLower) return def;
    }
  } catch {
    // Directory read error
  }

  return null;
}

function loadWorkflowFile(path: string): WorkflowDefinition | null {
  try {
    const content = readFileSync(path, "utf-8");
    return parseWorkflowDefinition(content);
  } catch {
    return null;
  }
}

// ─── Install ──────────────────────────────────────────────────────────────

/**
 * Install a workflow file to the global `~/.gsd/workflows/` directory.
 * Returns the destination path.
 */
export function installWorkflow(sourcePath: string): { installed: boolean; destPath: string; error?: string } {
  const globalDir = join(homedir(), ".gsd", "workflows");

  // Validate before installing
  if (!existsSync(sourcePath)) {
    return { installed: false, destPath: "", error: `File not found: ${sourcePath}` };
  }

  const def = loadWorkflowFile(sourcePath);
  if (!def) {
    return { installed: false, destPath: "", error: "Invalid workflow definition" };
  }

  mkdirSync(globalDir, { recursive: true });
  const destPath = join(globalDir, basename(sourcePath));
  copyFileSync(sourcePath, destPath);

  return { installed: true, destPath };
}

/**
 * Discover available workflows for a given base path.
 * Returns parsed WorkflowDefinition objects (heavier than listWorkflows).
 */
export function discoverWorkflows(basePath: string): WorkflowDefinition[] {
  const entries = listWorkflows(basePath);
  const defs: WorkflowDefinition[] = [];

  for (const entry of entries) {
    const def = loadWorkflowFile(entry.path);
    if (def) defs.push(def);
  }

  return defs;
}
