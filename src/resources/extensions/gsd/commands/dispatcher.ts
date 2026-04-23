import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { GSDNoProjectError } from "./context.js";
import { handleAutoCommand } from "./handlers/auto.js";
import { handleCoreCommand } from "./handlers/core.js";
import { handleOpsCommand } from "./handlers/ops.js";
import { handleParallelCommand } from "./handlers/parallel.js";
import { handleWorkflowCommand } from "./handlers/workflow.js";
import { handleMcp } from "../commands-mcp.js";

export async function handleGSDCommand(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const trimmed = (typeof args === "string" ? args : "").trim();

  if (trimmed === "mcp" || trimmed.startsWith("mcp ")) {
    await handleMcp(trimmed.slice(3).trim(), ctx);
    return;
  }

  const handlers = [
    () => handleCoreCommand(trimmed, ctx, pi),
    () => handleAutoCommand(trimmed, ctx, pi),
    () => handleParallelCommand(trimmed, ctx, pi),
    () => handleWorkflowCommand(trimmed, ctx, pi),
    () => handleOpsCommand(trimmed, ctx, pi),
  ];

  try {
    for (const handler of handlers) {
      if (await handler()) {
        return;
      }
    }
  } catch (err) {
    if (err instanceof GSDNoProjectError) {
      ctx.ui.notify(
        `${err.message} \`cd\` into a project directory first.`,
        "warning",
      );
      return;
    }
    throw err;
  }

  ctx.ui.notify(`Unknown: /gsd ${trimmed}. Run /gsd help for available commands.`, "warning");
}
