/**
 * single-writer-v3-tool-surface — Verifies the MCP tool surface that closes
 * the remaining gaps from .plans/single-writer-engine-v3-control-plane.md:
 *
 *   1. The 8 mutating workflow tools (plan/complete/replan/reassess) expose
 *      actorName + triggerReason as optional schema params, so an agent can
 *      self-identify (Stream 2: actor identity passthrough).
 *
 *   2. The 3 reversibility handlers (reopen-task/slice/milestone) are
 *      registered as MCP tools with both canonical and alias names
 *      (Stream 3: reversibility tools).
 *
 *   3. The reopen tools accept the documented core params plus optional
 *      reason/actorName/triggerReason without rejecting valid payloads.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { registerDbTools } from "../bootstrap/db-tools.ts";
import { Value } from "@sinclair/typebox/value";

function makeMockPi() {
  const tools: any[] = [];
  return {
    registerTool: (tool: any) => tools.push(tool),
    tools,
  } as any;
}

const pi = makeMockPi();
registerDbTools(pi);

function getTool(name: string) {
  return pi.tools.find((t: any) => t.name === name);
}

function getRequiredProps(tool: any): string[] {
  return tool.parameters.required ?? [];
}

function getProps(tool: any): string[] {
  return Object.keys(tool.parameters.properties ?? {});
}

// ─── Stream 2: actor identity exposure on 8 mutating workflow tools ─────────

const ACTOR_TOOLS = [
  "gsd_plan_milestone",
  "gsd_plan_slice",
  "gsd_plan_task",
  "gsd_task_complete",
  "gsd_slice_complete",
  "gsd_complete_milestone",
  "gsd_replan_slice",
  "gsd_reassess_roadmap",
];

for (const name of ACTOR_TOOLS) {
  test(`${name} — exposes actorName and triggerReason as optional`, () => {
    const tool = getTool(name);
    assert.ok(tool, `${name} must be registered`);

    const props = new Set(getProps(tool));
    const required = new Set(getRequiredProps(tool));

    assert.ok(props.has("actorName"), `${name} must expose actorName param`);
    assert.ok(props.has("triggerReason"), `${name} must expose triggerReason param`);
    assert.ok(!required.has("actorName"), `${name}.actorName must be optional`);
    assert.ok(!required.has("triggerReason"), `${name}.triggerReason must be optional`);
  });
}

// ─── Stream 3: reopen tools registered with canonical + alias names ─────────

const REOPEN_TOOLS = [
  { canonical: "gsd_task_reopen", alias: "gsd_reopen_task" },
  { canonical: "gsd_slice_reopen", alias: "gsd_reopen_slice" },
  { canonical: "gsd_milestone_reopen", alias: "gsd_reopen_milestone" },
];

for (const { canonical, alias } of REOPEN_TOOLS) {
  test(`${canonical} — registered with alias ${alias}`, () => {
    const canonicalTool = getTool(canonical);
    const aliasTool = getTool(alias);
    assert.ok(canonicalTool, `${canonical} must be registered`);
    assert.ok(aliasTool, `${alias} must be registered as alias`);
    assert.ok(typeof canonicalTool.execute === "function", `${canonical} must have an execute function`);
    assert.ok(typeof aliasTool.execute === "function", `${alias} must have an execute function`);
  });
}

// ─── Reopen tool schemas accept minimal core params ──────────────────────────

test("gsd_task_reopen — validates with only milestoneId/sliceId/taskId", () => {
  const tool = getTool("gsd_task_reopen");
  assert.ok(tool);
  const minimal = { milestoneId: "M001", sliceId: "S01", taskId: "T01" };
  const errors = [...Value.Errors(tool.parameters, minimal)];
  assert.strictEqual(errors.length, 0, `core params should validate; got: ${errors.map(e => `${e.path}: ${e.message}`).join(", ")}`);
});

test("gsd_task_reopen — accepts reason + actor fields", () => {
  const tool = getTool("gsd_task_reopen");
  assert.ok(tool);
  const full = {
    milestoneId: "M001",
    sliceId: "S01",
    taskId: "T01",
    reason: "regression discovered",
    actorName: "executor-01",
    triggerReason: "post-completion verification failure",
  };
  const errors = [...Value.Errors(tool.parameters, full)];
  assert.strictEqual(errors.length, 0, `full payload should validate; got: ${errors.map(e => `${e.path}: ${e.message}`).join(", ")}`);
});

test("gsd_slice_reopen — validates with only milestoneId/sliceId", () => {
  const tool = getTool("gsd_slice_reopen");
  assert.ok(tool);
  const minimal = { milestoneId: "M001", sliceId: "S01" };
  const errors = [...Value.Errors(tool.parameters, minimal)];
  assert.strictEqual(errors.length, 0, `core params should validate; got: ${errors.map(e => `${e.path}: ${e.message}`).join(", ")}`);
});

test("gsd_milestone_reopen — validates with only milestoneId", () => {
  const tool = getTool("gsd_milestone_reopen");
  assert.ok(tool);
  const minimal = { milestoneId: "M001" };
  const errors = [...Value.Errors(tool.parameters, minimal)];
  assert.strictEqual(errors.length, 0, `core params should validate; got: ${errors.map(e => `${e.path}: ${e.message}`).join(", ")}`);
});

// ─── MCP_WORKFLOW_TOOL_SURFACE includes the reopen tools ─────────────────────

test("workflow MCP surface includes the reopen tools", async () => {
  const { getWorkflowTransportSupportError } = await import("../workflow-mcp.ts");
  // The error builder reports tools that are required-but-missing from the surface.
  // If the reopen tools are missing from the surface, the error message will list them.
  // We probe by asking for a "claude-code" provider (which uses externalCli + local://)
  // with our reopen tools as required, and assert the surface has them.
  const err = getWorkflowTransportSupportError(
    "claude-code",
    ["gsd_task_reopen", "gsd_slice_reopen", "gsd_milestone_reopen"],
    { authMode: "externalCli", baseUrl: "local://test" },
  );

  // err is null when surface satisfies required tools, OR a non-null error mentioning
  // unrelated infra setup (like "workflow MCP server not configured"). Either way,
  // the error must NOT name our three reopen tools as missing from the surface.
  if (err !== null) {
    assert.ok(
      !err.includes("gsd_task_reopen") &&
      !err.includes("gsd_slice_reopen") &&
      !err.includes("gsd_milestone_reopen"),
      `surface should include all three reopen tools, but error reports them missing: ${err}`,
    );
  }
});
