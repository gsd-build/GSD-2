<overview>
Custom slash commands — registration, argument completions, subcommand patterns, and the extended command context.
</overview>

<basic_registration>
```typescript
pi.registerCommand("deploy", {
  description: "Deploy to an environment",
  handler: async (args, ctx) => {
    // args = everything after "/deploy "
    // ctx = ExtensionCommandContext (has session control methods)
    ctx.ui.notify(`Deploying to ${args || "production"}`, "info");
  },
});
```
</basic_registration>

<argument_completions>
Add tab-completion for command arguments:

```typescript
import type { AutocompleteItem } from "@mariozechner/pi-tui";

pi.registerCommand("deploy", {
  description: "Deploy to an environment",
  getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
    const envs = ["dev", "staging", "prod"];
    const items = envs.map(e => ({ value: e, label: e }));
    const filtered = items.filter(i => i.value.startsWith(prefix));
    return filtered.length > 0 ? filtered : null;
  },
  handler: async (args, ctx) => {
    ctx.ui.notify(`Deploying to ${args}`, "info");
  },
});
```
</argument_completions>

<subcommand_pattern>
Fake nested commands via first-argument parsing. Used by `/wt new|ls|switch|merge|rm`.

```typescript
pi.registerCommand("foo", {
  description: "Manage foo items: /foo new|list|delete [name]",

  getArgumentCompletions: (prefix: string) => {
    const parts = prefix.trim().split(/\s+/);

    // First arg: subcommand
    if (parts.length <= 1) {
      return ["new", "list", "delete"]
        .filter(cmd => cmd.startsWith(parts[0] ?? ""))
        .map(cmd => ({ value: cmd, label: cmd }));
    }

    // Second arg: depends on subcommand
    if (parts[0] === "delete") {
      const items = getItemsSomehow();
      return items
        .filter(name => name.startsWith(parts[1] ?? ""))
        .map(name => ({ value: `delete ${name}`, label: name }));
    }

    return [];
  },

  handler: async (args, ctx) => {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0];

    switch (sub) {
      case "new": /* ... */ return;
      case "list": /* ... */ return;
      case "delete": /* handle parts[1] */ return;
      default:
        ctx.ui.notify("Usage: /foo <new|list|delete> [name]", "info");
    }
  },
});
```

**Gotcha:** `"".trim().split(/\s+/)` produces `['']`, not `[]`. That's why `parts.length <= 1` handles both empty and partial first arg.
</subcommand_pattern>

<command_context>
Command handlers get `ExtensionCommandContext` which extends `ExtensionContext` with session control methods:

| Method | Purpose |
|--------|---------|
| `ctx.waitForIdle()` | Wait for agent to finish streaming |
| `ctx.newSession(options?)` | Create a new session |
| `ctx.fork(entryId)` | Fork from an entry |
| `ctx.navigateTree(targetId, options?)` | Navigate session tree |
| `ctx.reload()` | Hot-reload everything |

**⚠️ These methods are ONLY available in command handlers.** Calling them from event handlers causes deadlocks.

```typescript
pi.registerCommand("handoff", {
  handler: async (args, ctx) => {
    await ctx.waitForIdle();
    await ctx.newSession({
      setup: async (sm) => {
        sm.appendMessage({
          role: "user",
          content: [{ type: "text", text: `Context: ${args}` }],
          timestamp: Date.now(),
        });
      },
    });
  },
});
```
</command_context>

<reload_pattern>
Expose reload as both a command and a tool the LLM can call:

```typescript
pi.registerCommand("reload-runtime", {
  description: "Reload extensions, skills, prompts, and themes",
  handler: async (_args, ctx) => {
    await ctx.reload();
    return;  // Treat reload as terminal
  },
});

pi.registerTool({
  name: "reload_runtime",
  label: "Reload Runtime",
  description: "Reload extensions, skills, prompts, and themes",
  parameters: Type.Object({}),
  async execute() {
    pi.sendUserMessage("/reload-runtime", { deliverAs: "followUp" });
    return { content: [{ type: "text", text: "Queued /reload-runtime as follow-up." }] };
  },
});
```
</reload_pattern>
