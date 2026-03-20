import test from "node:test";
import assert from "node:assert/strict";

import { registerGSDCommand } from "../commands.ts";

function createMockPi() {
  const commands = new Map<string, any>();
  return {
    registerCommand(name: string, options: any) {
      commands.set(name, options);
    },
    registerTool() {},
    registerShortcut() {},
    on() {},
    sendMessage() {},
    commands,
  };
}

test("/gsd mcp appears in subcommand completions", () => {
  const pi = createMockPi();
  registerGSDCommand(pi as any);

  const gsd = pi.commands.get("gsd");
  assert.ok(gsd, "registerGSDCommand should register /gsd");

  const completions = gsd.getArgumentCompletions("mcp");
  const mcpEntry = completions.find((c: any) => c.value === "mcp");
  assert.ok(mcpEntry, "mcp should appear in completions");
  assert.equal(mcpEntry.label, "mcp");
  assert.ok(
    mcpEntry.description.toLowerCase().includes("mcp server"),
    "completion description should mention MCP servers",
  );
});

test("/gsd command description mentions mcp", () => {
  const pi = createMockPi();
  registerGSDCommand(pi as any);

  const gsd = pi.commands.get("gsd");
  assert.ok(gsd?.description?.includes("mcp"), "description should mention mcp");
});

test("/gsd mcp completions include diagnostic flags", () => {
  const pi = createMockPi();
  registerGSDCommand(pi as any);

  const gsd = pi.commands.get("gsd");
  const verboseCompletions = gsd.getArgumentCompletions("mcp --v");
  const verboseEntry = verboseCompletions.find((c: any) => c.value === "mcp --verbose");
  assert.ok(verboseEntry, "--verbose should appear in mcp completions");

  const refreshCompletions = gsd.getArgumentCompletions("mcp context7 --r");
  const refreshEntry = refreshCompletions.find((c: any) => c.value === "mcp context7 --refresh");
  assert.ok(refreshEntry, "--refresh should appear after a server name");
});
