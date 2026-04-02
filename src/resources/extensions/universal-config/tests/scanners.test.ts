/**
 * Tests for universal config discovery scanners.
 *
 * Uses temporary directories to simulate config layouts from each tool.
 * Runs with: node --experimental-strip-types --test
 */

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SCANNERS } from "../scanners.ts";
import { TOOLS } from "../tools.ts";
import type { ToolInfo, DiscoveredItem } from "../types.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTool(id: string): ToolInfo {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}

function mkdirp(path: string) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path: string, data: unknown) {
  mkdirp(join(path, ".."));
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

function writeText(path: string, content: string) {
  mkdirp(join(path, ".."));
  writeFileSync(path, content, "utf8");
}

function makeTempDirs(): { testRoot: string; testHome: string; cleanup: () => void } {
  const base = join(tmpdir(), `ucd-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const testRoot = join(base, "project");
  const testHome = join(base, "home");
  mkdirp(testRoot);
  mkdirp(testHome);
  return {
    testRoot,
    testHome,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

// ── Claude Code ───────────────────────────────────────────────────────────────

describe("Claude Code scanner", () => {
  test("discovers MCP servers from ~/.claude.json", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeJson(join(testHome, ".claude.json"), {
        mcpServers: {
          "test-server": { command: "npx", args: ["-y", "test-mcp"], type: "stdio" },
        },
      });

      const { items } = await SCANNERS.claude(testRoot, testHome, getTool("claude"));
      const servers = items.filter((i) => i.type === "mcp-server");
      assert.equal(servers.length, 1);
      assert.equal(servers[0]!.type, "mcp-server");
      if (servers[0]!.type === "mcp-server") {
        assert.equal(servers[0]!.name, "test-server");
        assert.equal(servers[0]!.command, "npx");
        assert.equal(servers[0]!.transport, "stdio");
        assert.equal(servers[0]!.source.level, "user");
      }
    } finally {
      cleanup();
    }
  });

  test("discovers project MCP from .claude/.mcp.json", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeJson(join(testRoot, ".claude/.mcp.json"), {
        mcpServers: { "project-server": { command: "node", args: ["server.js"] } },
      });

      const { items } = await SCANNERS.claude(testRoot, testHome, getTool("claude"));
      const servers = items.filter((i) => i.type === "mcp-server");
      assert.equal(servers.length, 1);
      assert.equal(servers[0]!.source.level, "project");
    } finally {
      cleanup();
    }
  });

  test("discovers CLAUDE.md context files", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeText(join(testHome, ".claude/CLAUDE.md"), "# User instructions");
      writeText(join(testRoot, "CLAUDE.md"), "# Project root instructions");
      writeText(join(testRoot, ".claude/CLAUDE.md"), "# Project .claude instructions");

      const { items } = await SCANNERS.claude(testRoot, testHome, getTool("claude"));
      const contexts = items.filter((i) => i.type === "context-file");
      assert.equal(contexts.length, 3);
    } finally {
      cleanup();
    }
  });

  test("discovers Claude Code skills and plugins", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeText(join(testHome, ".claude/skills/test-skill/SKILL.md"), "# test skill");
      writeJson(join(testHome, ".claude/plugins/test-plugin/package.json"), { name: "test-plugin" });

      const { items } = await SCANNERS.claude(testRoot, testHome, getTool("claude"));
      const skills = items.filter((i) => i.type === "claude-skill");
      const plugins = items.filter((i) => i.type === "claude-plugin");
      assert.equal(skills.length, 1);
      assert.equal(plugins.length, 1);
      if (skills[0]?.type === "claude-skill") assert.equal(skills[0].name, "test-skill");
      if (plugins[0]?.type === "claude-plugin") assert.equal(plugins[0].name, "test-plugin");
    } finally {
      cleanup();
    }
  });

  test("discovers settings.json", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeJson(join(testHome, ".claude/settings.json"), { theme: "dark" });

      const { items } = await SCANNERS.claude(testRoot, testHome, getTool("claude"));
      const settings = items.filter((i) => i.type === "settings");
      assert.equal(settings.length, 1);
    } finally {
      cleanup();
    }
  });

  test("handles missing files gracefully", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      const { items, warnings } = await SCANNERS.claude(testRoot, testHome, getTool("claude"));
      assert.equal(items.length, 0);
      assert.equal(warnings.length, 0);
    } finally {
      cleanup();
    }
  });
});

// ── Cursor ────────────────────────────────────────────────────────────────────

describe("Cursor scanner", () => {
  test("discovers MCP servers from .cursor/mcp.json", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeJson(join(testRoot, ".cursor/mcp.json"), {
        mcpServers: { "cursor-mcp": { command: "python", args: ["mcp.py"], type: "stdio" } },
      });

      const { items } = await SCANNERS.cursor(testRoot, testHome, getTool("cursor"));
      const servers = items.filter((i) => i.type === "mcp-server");
      assert.equal(servers.length, 1);
      if (servers[0]!.type === "mcp-server") {
        assert.equal(servers[0]!.name, "cursor-mcp");
        assert.equal(servers[0]!.command, "python");
      }
    } finally {
      cleanup();
    }
  });

  test("discovers rules from .cursor/rules/*.mdc", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeText(
        join(testRoot, ".cursor/rules/coding-style.mdc"),
        "---\ndescription: Coding style rules\nalwaysApply: true\n---\nUse TypeScript strict mode.",
      );

      const { items } = await SCANNERS.cursor(testRoot, testHome, getTool("cursor"));
      const rules = items.filter((i) => i.type === "rule");
      assert.equal(rules.length, 1);
      if (rules[0]!.type === "rule") {
        assert.equal(rules[0]!.name, "coding-style");
        assert.equal(rules[0]!.alwaysApply, true);
        assert.equal(rules[0]!.description, "Coding style rules");
      }
    } finally {
      cleanup();
    }
  });

  test("discovers legacy .cursorrules", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeText(join(testRoot, ".cursorrules"), "Always use semicolons.");

      const { items } = await SCANNERS.cursor(testRoot, testHome, getTool("cursor"));
      const rules = items.filter((i) => i.type === "rule");
      assert.equal(rules.length, 1);
      if (rules[0]!.type === "rule") {
        assert.equal(rules[0]!.content, "Always use semicolons.");
      }
    } finally {
      cleanup();
    }
  });
});

// ── Windsurf ──────────────────────────────────────────────────────────────────

describe("Windsurf scanner", () => {
  test("discovers MCP servers from mcp_config.json", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeJson(join(testRoot, ".windsurf/mcp_config.json"), {
        mcpServers: { "ws-server": { command: "node", args: ["ws.js"] } },
      });

      const { items } = await SCANNERS.windsurf(testRoot, testHome, getTool("windsurf"));
      const servers = items.filter((i) => i.type === "mcp-server");
      assert.equal(servers.length, 1);
    } finally {
      cleanup();
    }
  });

  test("discovers global rules from user dir", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeText(join(testHome, ".codeium/windsurf/memories/global_rules.md"), "Be concise.");

      const { items } = await SCANNERS.windsurf(testRoot, testHome, getTool("windsurf"));
      const rules = items.filter((i) => i.type === "rule");
      assert.equal(rules.length, 1);
      if (rules[0]!.type === "rule") {
        assert.equal(rules[0]!.name, "global_rules");
        assert.equal(rules[0]!.alwaysApply, true);
      }
    } finally {
      cleanup();
    }
  });
});

// ── Gemini CLI ────────────────────────────────────────────────────────────────

describe("Gemini CLI scanner", () => {
  test("discovers MCP servers from settings.json", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeJson(join(testRoot, ".gemini/settings.json"), {
        mcpServers: { "gemini-mcp": { command: "deno", args: ["run", "mcp.ts"] } },
      });

      const { items } = await SCANNERS.gemini(testRoot, testHome, getTool("gemini"));
      const servers = items.filter((i) => i.type === "mcp-server");
      assert.equal(servers.length, 1);
    } finally {
      cleanup();
    }
  });

  test("discovers GEMINI.md context files", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeText(join(testHome, ".gemini/GEMINI.md"), "User gemini instructions");
      writeText(join(testRoot, ".gemini/GEMINI.md"), "Project gemini instructions");

      const { items } = await SCANNERS.gemini(testRoot, testHome, getTool("gemini"));
      const contexts = items.filter((i) => i.type === "context-file");
      assert.equal(contexts.length, 2);
    } finally {
      cleanup();
    }
  });
});

// ── Codex ─────────────────────────────────────────────────────────────────────

describe("Codex scanner", () => {
  test("discovers AGENTS.md from user dir", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeText(join(testHome, ".codex/AGENTS.md"), "Codex user instructions");

      const { items } = await SCANNERS.codex(testRoot, testHome, getTool("codex"));
      const contexts = items.filter((i) => i.type === "context-file");
      assert.equal(contexts.length, 1);
      if (contexts[0]!.type === "context-file") {
        assert.equal(contexts[0]!.name, "AGENTS.md (user)");
      }
    } finally {
      cleanup();
    }
  });

  test("warns about TOML config", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeText(join(testHome, ".codex/config.toml"), "[mcp_servers.test]\ncommand = 'node'");

      const { warnings } = await SCANNERS.codex(testRoot, testHome, getTool("codex"));
      assert.ok(warnings.length > 0);
      assert.ok(warnings[0]!.includes("TOML"));
    } finally {
      cleanup();
    }
  });
});

// ── Cline ─────────────────────────────────────────────────────────────────────

describe("Cline scanner", () => {
  test("discovers .clinerules as single file", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeText(join(testRoot, ".clinerules"), "Follow TDD.");

      const { items } = await SCANNERS.cline(testRoot, testHome, getTool("cline"));
      const rules = items.filter((i) => i.type === "rule");
      assert.equal(rules.length, 1);
      if (rules[0]!.type === "rule") {
        assert.equal(rules[0]!.name, "clinerules");
        assert.equal(rules[0]!.alwaysApply, true);
      }
    } finally {
      cleanup();
    }
  });

  test("discovers .clinerules as directory", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      mkdirp(join(testRoot, ".clinerules"));
      writeText(join(testRoot, ".clinerules/style.md"), "Use 2-space indent.");
      writeText(join(testRoot, ".clinerules/testing.md"), "Write tests first.");

      const { items } = await SCANNERS.cline(testRoot, testHome, getTool("cline"));
      const rules = items.filter((i) => i.type === "rule");
      assert.equal(rules.length, 2);
    } finally {
      cleanup();
    }
  });

  test("handles missing .clinerules", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      const { items } = await SCANNERS.cline(testRoot, testHome, getTool("cline"));
      assert.equal(items.length, 0);
    } finally {
      cleanup();
    }
  });
});

// ── GitHub Copilot ────────────────────────────────────────────────────────────

describe("GitHub Copilot scanner", () => {
  test("discovers copilot-instructions.md", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeText(join(testRoot, ".github/copilot-instructions.md"), "Use TypeScript.");

      const { items } = await SCANNERS["github-copilot"](testRoot, testHome, getTool("github-copilot"));
      const contexts = items.filter((i) => i.type === "context-file");
      assert.equal(contexts.length, 1);
      if (contexts[0]!.type === "context-file") {
        assert.equal(contexts[0]!.name, "copilot-instructions.md");
      }
    } finally {
      cleanup();
    }
  });

  test("discovers .instructions.md files with frontmatter", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeText(
        join(testRoot, ".github/instructions/react.instructions.md"),
        '---\napplyTo: "**/*.tsx"\n---\nUse React functional components.',
      );

      const { items } = await SCANNERS["github-copilot"](testRoot, testHome, getTool("github-copilot"));
      const rules = items.filter((i) => i.type === "rule");
      assert.equal(rules.length, 1);
      if (rules[0]!.type === "rule") {
        assert.equal(rules[0]!.name, "react");
        assert.deepEqual(rules[0]!.globs, ["**/*.tsx"]);
      }
    } finally {
      cleanup();
    }
  });
});

// ── VS Code ───────────────────────────────────────────────────────────────────

describe("VS Code scanner", () => {
  test("discovers settings.json", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeJson(join(testRoot, ".vscode/settings.json"), {
        "editor.fontSize": 14,
      });

      const { items } = await SCANNERS.vscode(testRoot, testHome, getTool("vscode"));
      const settings = items.filter((i) => i.type === "settings");
      assert.equal(settings.length, 1);
    } finally {
      cleanup();
    }
  });

  test("discovers MCP servers from .vscode/mcp.json", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeJson(join(testRoot, ".vscode/mcp.json"), {
        servers: { "vscode-mcp": { command: "node", args: ["mcp.js"] } },
      });

      const { items } = await SCANNERS.vscode(testRoot, testHome, getTool("vscode"));
      const servers = items.filter((i) => i.type === "mcp-server");
      assert.equal(servers.length, 1);
      if (servers[0]!.type === "mcp-server") {
        assert.equal(servers[0]!.name, "vscode-mcp");
      }
    } finally {
      cleanup();
    }
  });

  test("discovers MCP servers embedded in settings.json", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeJson(join(testRoot, ".vscode/settings.json"), {
        "mcp.servers": {
          "embedded-mcp": { command: "python", args: ["-m", "mcp_server"] },
        },
      });

      const { items } = await SCANNERS.vscode(testRoot, testHome, getTool("vscode"));
      const servers = items.filter((i) => i.type === "mcp-server");
      assert.equal(servers.length, 1);
      if (servers[0]!.type === "mcp-server") {
        assert.equal(servers[0]!.name, "embedded-mcp");
      }
    } finally {
      cleanup();
    }
  });
});

