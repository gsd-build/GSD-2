import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  buildWorkflowMcpServers,
  detectWorkflowMcpLaunchConfig,
  getWorkflowTransportSupportError,
  getRequiredWorkflowToolsForAutoUnit,
  getRequiredWorkflowToolsForGuidedUnit,
  usesWorkflowMcpTransport,
} from "../workflow-mcp.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const gsdDir = join(__dirname, "..");

function readSrc(file: string): string {
  return readFileSync(join(gsdDir, file), "utf-8");
}

test("guided execute-task requires canonical task completion tool", () => {
  assert.deepEqual(getRequiredWorkflowToolsForGuidedUnit("execute-task"), ["gsd_task_complete"]);
});

test("auto execute-task requires legacy completion alias until prompt contract is aligned", () => {
  assert.deepEqual(getRequiredWorkflowToolsForAutoUnit("execute-task"), ["gsd_complete_task"]);
});

test("detectWorkflowMcpLaunchConfig prefers explicit env override", () => {
  const launch = detectWorkflowMcpLaunchConfig("/tmp/project", {
    GSD_WORKFLOW_MCP_NAME: "workflow-tools",
    GSD_WORKFLOW_MCP_COMMAND: "node",
    GSD_WORKFLOW_MCP_ARGS: JSON.stringify(["dist/cli.js"]),
    GSD_WORKFLOW_MCP_ENV: JSON.stringify({ FOO: "bar" }),
    GSD_WORKFLOW_MCP_CWD: "/tmp/project",
    GSD_CLI_PATH: "/tmp/gsd",
  });

  assert.deepEqual(launch, {
    name: "workflow-tools",
    command: "node",
    args: ["dist/cli.js"],
    cwd: "/tmp/project",
    env: {
      FOO: "bar",
      GSD_CLI_PATH: "/tmp/gsd",
      GSD_PERSIST_WRITE_GATE_STATE: "1",
      GSD_WORKFLOW_PROJECT_ROOT: "/tmp/project",
    },
  });
});

test("buildWorkflowMcpServers mirrors explicit launch config", () => {
  const servers = buildWorkflowMcpServers("/tmp/project", {
    GSD_WORKFLOW_MCP_COMMAND: "node",
    GSD_WORKFLOW_MCP_ARGS: JSON.stringify(["dist/cli.js"]),
  });

  assert.deepEqual(servers, {
    "gsd-workflow": {
      command: "node",
      args: ["dist/cli.js"],
      env: {
        GSD_PERSIST_WRITE_GATE_STATE: "1",
        GSD_WORKFLOW_PROJECT_ROOT: "/tmp/project",
      },
    },
  });
});

test("detectWorkflowMcpLaunchConfig resolves the bundled server from GSD_PROJECT_ROOT", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "gsd-workflow-root-"));
  const worktreeRoot = mkdtempSync(join(tmpdir(), "gsd-workflow-worktree-"));
  const cliPath = join(repoRoot, "packages", "mcp-server", "dist", "cli.js");

  mkdirSync(join(repoRoot, "packages", "mcp-server", "dist"), { recursive: true });
  writeFileSync(cliPath, "#!/usr/bin/env node\n", "utf-8");

  const launch = detectWorkflowMcpLaunchConfig(worktreeRoot, {
    GSD_PROJECT_ROOT: repoRoot,
  });

  assert.deepEqual(launch, {
    name: "gsd-workflow",
    command: process.execPath,
    args: [cliPath],
    cwd: repoRoot,
    env: {
      GSD_PERSIST_WRITE_GATE_STATE: "1",
      GSD_WORKFLOW_PROJECT_ROOT: repoRoot,
    },
  });
});

test("detectWorkflowMcpLaunchConfig resolves the bundled server relative to the installed GSD package", () => {
  const launch = detectWorkflowMcpLaunchConfig("/tmp/project", {
    GSD_BIN_PATH: "/tmp/gsd-loader.js",
  });

  assert.equal(launch?.command, process.execPath);
  assert.equal(launch?.cwd, "/tmp/project");
  assert.equal(launch?.env?.GSD_CLI_PATH, "/tmp/gsd-loader.js");
  assert.equal(launch?.env?.GSD_WORKFLOW_PROJECT_ROOT, "/tmp/project");
  assert.equal(typeof launch?.args?.[0], "string");
  assert.match(launch?.args?.[0] ?? "", /packages[\/\\]mcp-server[\/\\]dist[\/\\]cli\.js$/);
});

test("detectWorkflowMcpLaunchConfig resolves the bundled server relative to the package without env hints", () => {
  const launch = detectWorkflowMcpLaunchConfig("/tmp/project", {});

  assert.equal(launch?.command, process.execPath);
  assert.equal(launch?.cwd, "/tmp/project");
  assert.equal(launch?.env?.GSD_CLI_PATH, undefined);
  assert.equal(launch?.env?.GSD_WORKFLOW_PROJECT_ROOT, "/tmp/project");
  assert.equal(typeof launch?.args?.[0], "string");
  assert.match(launch?.args?.[0] ?? "", /packages[\/\\]mcp-server[\/\\]dist[\/\\]cli\.js$/);
});

test("usesWorkflowMcpTransport matches local externalCli providers", () => {
  assert.equal(usesWorkflowMcpTransport("externalCli", "local://claude-code"), true);
  assert.equal(usesWorkflowMcpTransport("externalCli", "https://api.example.com"), false);
  assert.equal(usesWorkflowMcpTransport("oauth", "local://custom"), false);
});

test("transport compatibility passes when required tools fit current MCP surface", () => {
  const error = getWorkflowTransportSupportError(
    "claude-code",
    ["gsd_task_complete"],
    {
      projectRoot: "/tmp/project",
      env: { GSD_WORKFLOW_MCP_COMMAND: "node" },
      surface: "guided flow",
      unitType: "execute-task",
      authMode: "externalCli",
      baseUrl: "local://claude-code",
    },
  );

  assert.equal(error, null);
});

test("transport compatibility discovers the bundled MCP server without env overrides", () => {
  const error = getWorkflowTransportSupportError(
    "claude-code",
    ["gsd_task_complete"],
    {
      projectRoot: "/tmp/project",
      env: {},
      surface: "auto-mode",
      unitType: "execute-task",
      authMode: "externalCli",
      baseUrl: "local://claude-code",
    },
  );

  assert.equal(error, null);
});

test("transport compatibility now allows auto execute-task over workflow MCP surface", () => {
  const error = getWorkflowTransportSupportError(
    "claude-code",
    ["gsd_complete_task"],
    {
      projectRoot: "/tmp/project",
      env: { GSD_WORKFLOW_MCP_COMMAND: "node" },
      surface: "auto-mode",
      unitType: "execute-task",
      authMode: "externalCli",
      baseUrl: "local://claude-code",
    },
  );

  assert.equal(error, null);
});

test("transport compatibility ignores API-backed providers", () => {
  const error = getWorkflowTransportSupportError(
    "openai-codex",
    ["gsd_plan_slice"],
    {
      projectRoot: "/tmp/project",
      env: {},
      surface: "auto-mode",
      unitType: "plan-slice",
      authMode: "oauth",
      baseUrl: "https://api.openai.com",
    },
  );

  assert.equal(error, null);
});

test("transport compatibility now allows plan-slice over workflow MCP surface", () => {
  const error = getWorkflowTransportSupportError(
    "claude-code",
    ["gsd_plan_slice"],
    {
      projectRoot: "/tmp/project",
      env: { GSD_WORKFLOW_MCP_COMMAND: "node" },
      surface: "auto-mode",
      unitType: "plan-slice",
      authMode: "externalCli",
      baseUrl: "local://claude-code",
    },
  );

  assert.equal(error, null);
});

test("transport compatibility now allows complete-slice over workflow MCP surface", () => {
  const error = getWorkflowTransportSupportError(
    "claude-code",
    ["gsd_complete_slice"],
    {
      projectRoot: "/tmp/project",
      env: { GSD_WORKFLOW_MCP_COMMAND: "node" },
      surface: "auto-mode",
      unitType: "complete-slice",
      authMode: "externalCli",
      baseUrl: "local://claude-code",
    },
  );

  assert.equal(error, null);
});

test("transport compatibility now allows reassess-roadmap over workflow MCP surface", () => {
  const error = getWorkflowTransportSupportError(
    "claude-code",
    ["gsd_milestone_status", "gsd_reassess_roadmap"],
    {
      projectRoot: "/tmp/project",
      env: { GSD_WORKFLOW_MCP_COMMAND: "node" },
      surface: "auto-mode",
      unitType: "reassess-roadmap",
      authMode: "externalCli",
      baseUrl: "local://claude-code",
    },
  );

  assert.equal(error, null);
});

test("transport compatibility now allows gate-evaluate over workflow MCP surface", () => {
  const error = getWorkflowTransportSupportError(
    "claude-code",
    ["gsd_save_gate_result"],
    {
      projectRoot: "/tmp/project",
      env: { GSD_WORKFLOW_MCP_COMMAND: "node" },
      surface: "auto-mode",
      unitType: "gate-evaluate",
      authMode: "externalCli",
      baseUrl: "local://claude-code",
    },
  );

  assert.equal(error, null);
});

test("transport compatibility now allows validate-milestone over workflow MCP surface", () => {
  const error = getWorkflowTransportSupportError(
    "claude-code",
    ["gsd_milestone_status", "gsd_validate_milestone"],
    {
      projectRoot: "/tmp/project",
      env: { GSD_WORKFLOW_MCP_COMMAND: "node" },
      surface: "auto-mode",
      unitType: "validate-milestone",
      authMode: "externalCli",
      baseUrl: "local://claude-code",
    },
  );

  assert.equal(error, null);
});

test("transport compatibility now allows complete-milestone over workflow MCP surface", () => {
  const error = getWorkflowTransportSupportError(
    "claude-code",
    ["gsd_milestone_status", "gsd_complete_milestone"],
    {
      projectRoot: "/tmp/project",
      env: { GSD_WORKFLOW_MCP_COMMAND: "node" },
      surface: "auto-mode",
      unitType: "complete-milestone",
      authMode: "externalCli",
      baseUrl: "local://claude-code",
    },
  );

  assert.equal(error, null);
});

test("transport compatibility now allows replan-slice over workflow MCP surface", () => {
  const error = getWorkflowTransportSupportError(
    "claude-code",
    ["gsd_replan_slice"],
    {
      projectRoot: "/tmp/project",
      env: { GSD_WORKFLOW_MCP_COMMAND: "node" },
      surface: "auto-mode",
      unitType: "replan-slice",
      authMode: "externalCli",
      baseUrl: "local://claude-code",
    },
  );

  assert.equal(error, null);
});

test("transport compatibility still blocks units whose MCP tools are not exposed", () => {
  const error = getWorkflowTransportSupportError(
    "claude-code",
    ["gsd_skip_slice"],
    {
      projectRoot: "/tmp/project",
      env: { GSD_WORKFLOW_MCP_COMMAND: "node" },
      surface: "auto-mode",
      unitType: "skip-slice",
      authMode: "externalCli",
      baseUrl: "local://claude-code",
    },
  );

  assert.match(error ?? "", /requires gsd_skip_slice/);
  assert.match(error ?? "", /currently exposes only/);
});

test("guided-flow source enforces workflow compatibility preflight", () => {
  const src = readSrc("guided-flow.ts");
  assert.match(src, /getRequiredWorkflowToolsForGuidedUnit/);
  assert.match(src, /getWorkflowTransportSupportError/);
});

test("auto direct dispatch source enforces workflow compatibility preflight", () => {
  const src = readSrc("auto-direct-dispatch.ts");
  assert.match(src, /getRequiredWorkflowToolsForAutoUnit/);
  assert.match(src, /getWorkflowTransportSupportError/);
});

test("auto phases source enforces workflow compatibility preflight", () => {
  const src = readSrc(join("auto", "phases.ts"));
  assert.match(src, /getRequiredWorkflowToolsForAutoUnit/);
  assert.match(src, /getWorkflowTransportSupportError/);
  assert.match(src, /workflow-capability/);
});
