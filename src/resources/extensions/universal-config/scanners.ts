/**
 * Universal Config Discovery — per-tool scanners
 *
 * Each scanner reads config files for a specific AI coding tool and
 * normalizes them to DiscoveredItem[]. Read-only: never modifies files.
 *
 * Config path sources verified against Oh My Pi's discovery module.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { splitFrontmatter, parseFrontmatterMap } from "../shared/frontmatter.js";
import type {
  ConfigSource,
  ConfigLevel,
  DiscoveredItem,
  DiscoveredMCPServer,
  DiscoveredRule,
  DiscoveredContextFile,
  DiscoveredSettings,
  ToolDiscoveryResult,
  ToolId,
  ToolInfo,
} from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function source(tool: ToolInfo, path: string, level: ConfigLevel): ConfigSource {
  return { tool: tool.id, toolName: tool.name, path, level };
}

function walkDirectories(root: string, visit: (dir: string, depth: number) => void, maxDepth = 4): void {
  const skip = new Set([".git", "node_modules", ".worktrees", "dist", "build", "cache", ".cache"]);

  function walk(dir: string, depth: number) {
    visit(dir, depth);
    if (depth >= maxDepth) return;

    let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (skip.has(entry.name)) continue;
      walk(join(dir, entry.name), depth + 1);
    }
  }

  walk(root, 0);
}

async function readTextFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function tryParseJson<T>(content: string): T | null {
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function readDirSafe(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const [lines, body] = splitFrontmatter(content);
  return { frontmatter: lines ? parseFrontmatterMap(lines) : {}, body };
}

/**
 * Parse MCP servers from a JSON object with `mcpServers` key.
 * Common format used by Claude Code, Cursor, Windsurf, Gemini CLI.
 */
function parseMcpServersFromJson(
  json: Record<string, unknown>,
  filePath: string,
  tool: ToolInfo,
  level: ConfigLevel,
): DiscoveredMCPServer[] {
  const servers: DiscoveredMCPServer[] = [];
  const mcpServers = json.mcpServers as Record<string, unknown> | undefined;
  if (!mcpServers || typeof mcpServers !== "object") return servers;

  for (const [name, config] of Object.entries(mcpServers)) {
    if (!config || typeof config !== "object") continue;
    const c = config as Record<string, unknown>;
    servers.push({
      type: "mcp-server",
      name,
      command: typeof c.command === "string" ? c.command : undefined,
      args: Array.isArray(c.args) ? (c.args as string[]) : undefined,
      env: c.env && typeof c.env === "object" ? (c.env as Record<string, string>) : undefined,
      url: typeof c.url === "string" ? c.url : undefined,
      transport: ["stdio", "sse", "http"].includes(c.type as string)
        ? (c.type as "stdio" | "sse" | "http")
        : undefined,
      source: source(tool, filePath, level),
    });
  }
  return servers;
}

// ── Per-tool scanners ─────────────────────────────────────────────────────────

type Scanner = (projectRoot: string, home: string, tool: ToolInfo) => Promise<{ items: DiscoveredItem[]; warnings: string[] }>;

// ---------- Claude Code ----------

async function scanClaude(projectRoot: string, home: string, tool: ToolInfo): Promise<{ items: DiscoveredItem[]; warnings: string[] }> {
  const items: DiscoveredItem[] = [];
  const warnings: string[] = [];

  // User-level MCP: ~/.claude.json or ~/.claude/mcp.json
  for (const relPath of [".claude.json", ".claude/mcp.json"]) {
    const fullPath = join(home, relPath);
    const content = await readTextFile(fullPath);
    if (content) {
      const json = tryParseJson<Record<string, unknown>>(content);
      if (json) {
        const servers = parseMcpServersFromJson(json, fullPath, tool, "user");
        if (servers.length > 0) {
          items.push(...servers);
          break; // First hit wins (matches Oh My Pi behavior)
        }
      }
    }
  }

  // Project-level MCP: .mcp.json (standard), .claude/.mcp.json, or .claude/mcp.json
  for (const relPath of [".mcp.json", ".claude/.mcp.json", ".claude/mcp.json"]) {
    const fullPath = join(projectRoot, relPath);
    const content = await readTextFile(fullPath);
    if (content) {
      const json = tryParseJson<Record<string, unknown>>(content);
      if (json) {
        const servers = parseMcpServersFromJson(json, fullPath, tool, "project");
        if (servers.length > 0) {
          items.push(...servers);
          break;
        }
      }
    }
  }

  // User-level context: ~/.claude/CLAUDE.md
  const userClaudeMd = join(home, ".claude/CLAUDE.md");
  const userMdContent = await readTextFile(userClaudeMd);
  if (userMdContent) {
    items.push({
      type: "context-file",
      name: "CLAUDE.md (user)",
      content: userMdContent,
      source: source(tool, userClaudeMd, "user"),
    });
  }

  // Project-level context: CLAUDE.md (root) and .claude/CLAUDE.md
  for (const relPath of ["CLAUDE.md", ".claude/CLAUDE.md"]) {
    const fullPath = join(projectRoot, relPath);
    const content = await readTextFile(fullPath);
    if (content) {
      items.push({
        type: "context-file",
        name: `${relPath}`,
        content,
        source: source(tool, fullPath, "project"),
      });
    }
  }

  // Claude skills: ~/.claude/skills/**/SKILL.md
  const userSkillsRoot = join(home, ".claude/skills");
  if (existsSync(userSkillsRoot)) {
    walkDirectories(userSkillsRoot, (dir) => {
      const skillFile = join(dir, "SKILL.md");
      if (!existsSync(skillFile)) return;
      items.push({
        type: "claude-skill",
        name: basename(dir),
        path: dir,
        source: source(tool, skillFile, "user"),
      });
    }, 5);
  }

  // Claude plugins: ~/.claude/plugins/**/package.json
  const userPluginsRoot = join(home, ".claude/plugins");
  if (existsSync(userPluginsRoot)) {
    walkDirectories(userPluginsRoot, (dir) => {
      const packageJsonPath = join(dir, "package.json");
      if (!existsSync(packageJsonPath)) return;
      let packageName: string | undefined;
      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: string };
        packageName = pkg.name;
      } catch {
        packageName = undefined;
      }
      items.push({
        type: "claude-plugin",
        name: packageName || basename(dir),
        packageName,
        path: dir,
        source: source(tool, packageJsonPath, "user"),
      });
    }, 4);
  }

  // User-level settings: ~/.claude/settings.json
  const userSettings = join(home, ".claude/settings.json");
  const settingsContent = await readTextFile(userSettings);
  if (settingsContent) {
    const json = tryParseJson<Record<string, unknown>>(settingsContent);
    if (json) {
      items.push({ type: "settings", data: json, source: source(tool, userSettings, "user") });
    }
  }

  return { items, warnings };
}

// ---------- Cursor ----------

async function scanCursor(projectRoot: string, home: string, tool: ToolInfo): Promise<{ items: DiscoveredItem[]; warnings: string[] }> {
  const items: DiscoveredItem[] = [];
  const warnings: string[] = [];

  // MCP servers: ~/.cursor/mcp.json and .cursor/mcp.json
  for (const { dir, level } of [
    { dir: home, level: "user" as ConfigLevel },
    { dir: projectRoot, level: "project" as ConfigLevel },
  ]) {
    const mcpPath = join(dir, ".cursor/mcp.json");
    const content = await readTextFile(mcpPath);
    if (content) {
      const json = tryParseJson<Record<string, unknown>>(content);
      if (json) items.push(...parseMcpServersFromJson(json, mcpPath, tool, level));
    }
  }

  // Rules: .cursor/rules/*.mdc and .cursor/rules/*.md
  const projectRulesDir = join(projectRoot, ".cursor/rules");
  const ruleFiles = await readDirSafe(projectRulesDir);
  for (const file of ruleFiles) {
    if (!file.endsWith(".mdc") && !file.endsWith(".md")) continue;
    const filePath = join(projectRulesDir, file);
    const content = await readTextFile(filePath);
    if (!content) continue;

    const { frontmatter, body } = parseFrontmatter(content);
    items.push({
      type: "rule",
      name: file.replace(/\.(mdc|md)$/, ""),
      content: body,
      globs: typeof frontmatter.globs === "string" ? [frontmatter.globs] : undefined,
      alwaysApply: frontmatter.alwaysApply === true,
      description: typeof frontmatter.description === "string" ? frontmatter.description : undefined,
      source: source(tool, filePath, "project"),
    });
  }

  // Legacy: .cursorrules (root-level file)
  const legacyRulesPath = join(projectRoot, ".cursorrules");
  const legacyContent = await readTextFile(legacyRulesPath);
  if (legacyContent) {
    items.push({
      type: "rule",
      name: "cursorrules (legacy)",
      content: legacyContent,
      alwaysApply: true,
      source: source(tool, legacyRulesPath, "project"),
    });
  }

  // Settings: .cursor/settings.json
  const settingsPath = join(projectRoot, ".cursor/settings.json");
  const settingsContent = await readTextFile(settingsPath);
  if (settingsContent) {
    const json = tryParseJson<Record<string, unknown>>(settingsContent);
    if (json) items.push({ type: "settings", data: json, source: source(tool, settingsPath, "project") });
  }

  return { items, warnings };
}

// ---------- Windsurf ----------

async function scanWindsurf(projectRoot: string, home: string, tool: ToolInfo): Promise<{ items: DiscoveredItem[]; warnings: string[] }> {
  const items: DiscoveredItem[] = [];
  const warnings: string[] = [];

  // MCP servers: ~/.codeium/windsurf/mcp_config.json and .windsurf/mcp_config.json
  for (const { path: mcpPath, level } of [
    { path: join(home, ".codeium/windsurf/mcp_config.json"), level: "user" as ConfigLevel },
    { path: join(projectRoot, ".windsurf/mcp_config.json"), level: "project" as ConfigLevel },
  ]) {
    const content = await readTextFile(mcpPath);
    if (content) {
      const json = tryParseJson<Record<string, unknown>>(content);
      if (json) items.push(...parseMcpServersFromJson(json, mcpPath, tool, level));
    }
  }

  // User rules: ~/.codeium/windsurf/memories/global_rules.md
  const globalRulesPath = join(home, ".codeium/windsurf/memories/global_rules.md");
  const globalRules = await readTextFile(globalRulesPath);
  if (globalRules) {
    items.push({
      type: "rule",
      name: "global_rules",
      content: globalRules,
      alwaysApply: true,
      source: source(tool, globalRulesPath, "user"),
    });
  }

  // Project rules: .windsurf/rules/*.md
  const rulesDir = join(projectRoot, ".windsurf/rules");
  const ruleFiles = await readDirSafe(rulesDir);
  for (const file of ruleFiles) {
    if (!file.endsWith(".md")) continue;
    const filePath = join(rulesDir, file);
    const content = await readTextFile(filePath);
    if (!content) continue;
    const { frontmatter, body } = parseFrontmatter(content);
    items.push({
      type: "rule",
      name: file.replace(/\.md$/, ""),
      content: body,
      description: typeof frontmatter.description === "string" ? frontmatter.description : undefined,
      source: source(tool, filePath, "project"),
    });
  }

  // Legacy: .windsurfrules
  const legacyPath = join(projectRoot, ".windsurfrules");
  const legacyContent = await readTextFile(legacyPath);
  if (legacyContent) {
    items.push({
      type: "rule",
      name: "windsurfrules (legacy)",
      content: legacyContent,
      alwaysApply: true,
      source: source(tool, legacyPath, "project"),
    });
  }

  return { items, warnings };
}

// ---------- Gemini CLI ----------

async function scanGemini(projectRoot: string, home: string, tool: ToolInfo): Promise<{ items: DiscoveredItem[]; warnings: string[] }> {
  const items: DiscoveredItem[] = [];
  const warnings: string[] = [];

  // MCP servers: ~/.gemini/settings.json and .gemini/settings.json
  for (const { path: settingsPath, level } of [
    { path: join(home, ".gemini/settings.json"), level: "user" as ConfigLevel },
    { path: join(projectRoot, ".gemini/settings.json"), level: "project" as ConfigLevel },
  ]) {
    const content = await readTextFile(settingsPath);
    if (content) {
      const json = tryParseJson<Record<string, unknown>>(content);
      if (json) {
        items.push(...parseMcpServersFromJson(json, settingsPath, tool, level));
        items.push({ type: "settings", data: json, source: source(tool, settingsPath, level) });
      }
    }
  }

  // Context files: ~/.gemini/GEMINI.md and .gemini/GEMINI.md
  for (const { path: mdPath, level } of [
    { path: join(home, ".gemini/GEMINI.md"), level: "user" as ConfigLevel },
    { path: join(projectRoot, ".gemini/GEMINI.md"), level: "project" as ConfigLevel },
  ]) {
    const content = await readTextFile(mdPath);
    if (content) {
      items.push({
        type: "context-file",
        name: `GEMINI.md (${level})`,
        content,
        source: source(tool, mdPath, level),
      });
    }
  }

  return { items, warnings };
}

// ---------- Codex ----------

async function scanCodex(projectRoot: string, home: string, tool: ToolInfo): Promise<{ items: DiscoveredItem[]; warnings: string[] }> {
  const items: DiscoveredItem[] = [];
  const warnings: string[] = [];

  // Context file: ~/.codex/AGENTS.md
  const agentsMdPath = join(home, ".codex/AGENTS.md");
  const agentsMd = await readTextFile(agentsMdPath);
  if (agentsMd) {
    items.push({
      type: "context-file",
      name: "AGENTS.md (user)",
      content: agentsMd,
      source: source(tool, agentsMdPath, "user"),
    });
  }

  // Project-level: AGENTS.md at root (Codex convention)
  const projectAgentsMd = join(projectRoot, "AGENTS.md");
  const projectContent = await readTextFile(projectAgentsMd);
  if (projectContent) {
    items.push({
      type: "context-file",
      name: "AGENTS.md (project)",
      content: projectContent,
      source: source(tool, projectAgentsMd, "project"),
    });
  }

  // Codex uses TOML for MCP config — we parse only the JSON subset
  // (TOML parsing would require a dependency; skip for now, log warning)
  for (const { path: tomlPath, level } of [
    { path: join(home, ".codex/config.toml"), level: "user" as ConfigLevel },
    { path: join(projectRoot, ".codex/config.toml"), level: "project" as ConfigLevel },
  ]) {
    if (await fileExists(tomlPath)) {
      warnings.push(`Found ${tomlPath} (TOML config) — MCP server parsing from TOML not yet supported`);
    }
  }

  return { items, warnings };
}

// ---------- Cline ----------

async function scanCline(projectRoot: string, _home: string, tool: ToolInfo): Promise<{ items: DiscoveredItem[]; warnings: string[] }> {
  const items: DiscoveredItem[] = [];
  const warnings: string[] = [];

  const clinerulesPath = join(projectRoot, ".clinerules");

  if (await isDirectory(clinerulesPath)) {
    // Directory format: .clinerules/*.md
    const files = await readDirSafe(clinerulesPath);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const filePath = join(clinerulesPath, file);
      const content = await readTextFile(filePath);
      if (!content) continue;
      const { body } = parseFrontmatter(content);
      items.push({
        type: "rule",
        name: file.replace(/\.md$/, ""),
        content: body,
        alwaysApply: true,
        source: source(tool, filePath, "project"),
      });
    }
  } else {
    // Single file format
    const content = await readTextFile(clinerulesPath);
    if (content) {
      items.push({
        type: "rule",
        name: "clinerules",
        content,
        alwaysApply: true,
        source: source(tool, clinerulesPath, "project"),
      });
    }
  }

  // Cline MCP: .cline/mcp_settings.json (VS Code extension stores MCP here)
  const clineMcpPath = join(projectRoot, ".cline/mcp_settings.json");
  const clineMcpContent = await readTextFile(clineMcpPath);
  if (clineMcpContent) {
    const json = tryParseJson<Record<string, unknown>>(clineMcpContent);
    if (json) items.push(...parseMcpServersFromJson(json, clineMcpPath, tool, "project"));
  }

  return { items, warnings };
}

// ---------- GitHub Copilot ----------

async function scanGithubCopilot(projectRoot: string, _home: string, tool: ToolInfo): Promise<{ items: DiscoveredItem[]; warnings: string[] }> {
  const items: DiscoveredItem[] = [];
  const warnings: string[] = [];

  // Context file: .github/copilot-instructions.md
  const instructionsPath = join(projectRoot, ".github/copilot-instructions.md");
  const instructions = await readTextFile(instructionsPath);
  if (instructions) {
    items.push({
      type: "context-file",
      name: "copilot-instructions.md",
      content: instructions,
      source: source(tool, instructionsPath, "project"),
    });
  }

  // Instructions: .github/instructions/*.instructions.md
  const instructionsDir = join(projectRoot, ".github/instructions");
  const instrFiles = await readDirSafe(instructionsDir);
  for (const file of instrFiles) {
    if (!file.endsWith(".instructions.md")) continue;
    const filePath = join(instructionsDir, file);
    const content = await readTextFile(filePath);
    if (!content) continue;
    const { frontmatter, body } = parseFrontmatter(content);
    const applyTo = typeof frontmatter.applyTo === "string" ? frontmatter.applyTo : undefined;
    items.push({
      type: "rule",
      name: file.replace(".instructions.md", ""),
      content: body,
      globs: applyTo ? [applyTo] : undefined,
      description: `GitHub Copilot instruction${applyTo ? ` (applies to: ${applyTo})` : ""}`,
      source: source(tool, filePath, "project"),
    });
  }

  return { items, warnings };
}

// ---------- VS Code ----------

async function scanVSCode(projectRoot: string, _home: string, tool: ToolInfo): Promise<{ items: DiscoveredItem[]; warnings: string[] }> {
  const items: DiscoveredItem[] = [];
  const warnings: string[] = [];

  // Settings: .vscode/settings.json (may contain MCP servers and AI settings)
  const settingsPath = join(projectRoot, ".vscode/settings.json");
  const settingsContent = await readTextFile(settingsPath);
  if (settingsContent) {
    const json = tryParseJson<Record<string, unknown>>(settingsContent);
    if (json) {
      items.push({ type: "settings", data: json, source: source(tool, settingsPath, "project") });

      // VS Code MCP servers: look for mcp-related keys
      // Format varies: "mcp.servers", "mcpServers", etc.
      const mcpServers = (json["mcp.servers"] ?? json.mcpServers ?? (json.mcp as Record<string, unknown>)?.servers) as Record<string, unknown> | undefined;
      if (mcpServers && typeof mcpServers === "object") {
        items.push(...parseMcpServersFromJson({ mcpServers }, settingsPath, tool, "project"));
      }
    }
  }

  // VS Code MCP config: .vscode/mcp.json
  const mcpPath = join(projectRoot, ".vscode/mcp.json");
  const mcpContent = await readTextFile(mcpPath);
  if (mcpContent) {
    const json = tryParseJson<Record<string, unknown>>(mcpContent);
    if (json) {
      // VS Code uses { servers: { ... } } or { mcpServers: { ... } }
      const servers = (json.servers ?? json.mcpServers) as Record<string, unknown> | undefined;
      if (servers && typeof servers === "object") {
        items.push(...parseMcpServersFromJson({ mcpServers: servers }, mcpPath, tool, "project"));
      }
    }
  }

  return { items, warnings };
}

// ── Scanner registry ──────────────────────────────────────────────────────────

export const SCANNERS: Record<ToolId, Scanner> = {
  claude: scanClaude,
  cursor: scanCursor,
  windsurf: scanWindsurf,
  gemini: scanGemini,
  codex: scanCodex,
  cline: scanCline,
  "github-copilot": scanGithubCopilot,
  vscode: scanVSCode,
};
