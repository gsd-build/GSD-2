/**
 * {{EXTENSION_NAME}} — Stateful tool with persistence
 *
 * State is stored in tool result details for proper branching support.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text, truncateToWidth, matchesKey, Key } from "@mariozechner/pi-tui";

interface {{ItemType}} {
  id: number;
  // Add fields
}

interface {{ToolDetails}} {
  action: string;
  items: {{ItemType}}[];
  nextId: number;
  error?: string;
}

export default function (pi: ExtensionAPI) {
  let items: {{ItemType}}[] = [];
  let nextId = 1;

  // Reconstruct state from session
  const reconstructState = (ctx: ExtensionContext) => {
    items = [];
    nextId = 1;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "message" && entry.message.role === "toolResult") {
        if (entry.message.toolName === "{{tool_name}}") {
          const details = entry.message.details as {{ToolDetails}} | undefined;
          if (details) {
            items = details.items;
            nextId = details.nextId;
          }
        }
      }
    }
  };

  // Reconstruct on ALL session change events
  pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_switch", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_fork", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

  // Register the tool
  pi.registerTool({
    name: "{{tool_name}}",
    label: "{{Tool Label}}",
    description: "{{Description for LLM}}",
    parameters: Type.Object({
      action: StringEnum(["list", "add", "remove"] as const),
      text: Type.Optional(Type.String({ description: "Item text" })),
      id: Type.Optional(Type.Number({ description: "Item ID" })),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Cancelled" }] };
      }

      switch (params.action) {
        case "list":
          return {
            content: [{ type: "text", text: items.length ? JSON.stringify(items) : "No items" }],
            details: { action: "list", items: [...items], nextId } as {{ToolDetails}},
          };

        case "add": {
          if (!params.text) throw new Error("text required for add");
          const item: {{ItemType}} = { id: nextId++ /* , ... */ };
          items.push(item);
          return {
            content: [{ type: "text", text: `Added #${item.id}` }],
            details: { action: "add", items: [...items], nextId } as {{ToolDetails}},
          };
        }

        case "remove": {
          if (params.id === undefined) throw new Error("id required for remove");
          const idx = items.findIndex(i => i.id === params.id);
          if (idx === -1) throw new Error(`Item #${params.id} not found`);
          items.splice(idx, 1);
          return {
            content: [{ type: "text", text: `Removed #${params.id}` }],
            details: { action: "remove", items: [...items], nextId } as {{ToolDetails}},
          };
        }

        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    },

    // Custom rendering
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("{{tool_name}} "));
      text += theme.fg("muted", args.action);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as {{ToolDetails}} | undefined;
      if (!details) return new Text("", 0, 0);
      if (details.error) return new Text(theme.fg("error", details.error), 0, 0);
      return new Text(theme.fg("success", `✓ ${details.action} (${details.items.length} items)`), 0, 0);
    },
  });

  // User command to view state
  pi.registerCommand("{{command_name}}", {
    description: "View {{items}}",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("Requires interactive mode", "error");
        return;
      }
      await ctx.ui.custom<void>((_tui, theme, _kb, done) => ({
        render(width: number): string[] {
          const lines = [
            "",
            truncateToWidth(theme.fg("accent", ` {{Items}} (${items.length}) `), width),
            "",
          ];
          for (const item of items) {
            lines.push(truncateToWidth(`  #${item.id}`, width));
          }
          lines.push("", truncateToWidth(theme.fg("dim", "  Press Escape to close"), width), "");
          return lines;
        },
        handleInput(data: string) {
          if (matchesKey(data, Key.escape)) done();
        },
        invalidate() {},
      }));
    },
  });
}
