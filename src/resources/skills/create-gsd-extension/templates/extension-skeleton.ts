/**
 * {{EXTENSION_NAME}} — {{DESCRIPTION}}
 *
 * Capabilities:
 * {{CAPABILITIES_LIST}}
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

export default function (pi: ExtensionAPI) {
  // === Events ===

  pi.on("session_start", async (_event, ctx) => {
    // Initialize state, restore from session, show status
  });

  // === Tools ===

  pi.registerTool({
    name: "{{tool_name}}",
    label: "{{Tool Label}}",
    description: "{{Tool description for LLM}}",
    parameters: Type.Object({
      action: StringEnum(["list", "add"] as const),
      text: Type.Optional(Type.String({ description: "Item text" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Cancelled" }] };
      }

      // Do work here

      return {
        content: [{ type: "text", text: "Result for LLM" }],
        details: {},
      };
    },
  });

  // === Commands ===

  pi.registerCommand("{{command_name}}", {
    description: "{{Command description}}",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Running ${args}`, "info");
    },
  });
}
