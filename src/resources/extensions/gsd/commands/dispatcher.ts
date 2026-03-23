import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

function firstWord(trimmed: string): string {
  const idx = trimmed.indexOf(" ");
  return idx === -1 ? trimmed : trimmed.slice(0, idx);
}

const CORE_COMMANDS = new Set(["help", "h", "?", "status", "visualize", "widget", "mode", "prefs", "cmux", "setup"]);
const AUTO_COMMANDS = new Set(["", "next", "auto", "stop", "pause", "rate"]);
const WORKFLOW_COMMANDS = new Set(["queue", "discuss", "quick", "new-milestone", "start", "templates", "park", "unpark"]);

export async function handleGSDCommand(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const trimmed = (typeof args === "string" ? args : "").trim();
  const command = firstWord(trimmed);

  if (CORE_COMMANDS.has(command)) {
    const core = await import("./handlers/core.js");
    if (await core.handleCoreCommand(trimmed, ctx)) return;
  }

  if (AUTO_COMMANDS.has(command)) {
    const auto = await import("./handlers/auto.js");
    if (await auto.handleAutoCommand(trimmed, ctx, pi)) return;
  }

  if (command === "parallel") {
    const parallel = await import("./handlers/parallel.js");
    if (await parallel.handleParallelCommand(trimmed, ctx, pi)) return;
  }

  if (command === "mcp") {
    const { handleMcp } = await import("../commands-mcp.js");
    await handleMcp(trimmed.replace(/^mcp\s*/, "").trim(), ctx);
    return;
  }

  if (WORKFLOW_COMMANDS.has(command)) {
    const workflow = await import("./handlers/workflow.js");
    if (await workflow.handleWorkflowCommand(trimmed, ctx, pi)) return;
  }

  const ops = await import("./handlers/ops.js");
  if (await ops.handleOpsCommand(trimmed, ctx, pi)) return;

  ctx.ui.notify(`Unknown: /gsd ${trimmed}. Run /gsd help for available commands.`, "warning");
}
