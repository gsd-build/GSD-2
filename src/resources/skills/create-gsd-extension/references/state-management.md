<overview>
State management patterns for extensions — tool result details (branch-safe) and appendEntry (private).
</overview>

<tool_result_details>
**Recommended for stateful tools.** State in `details` works correctly with branching/forking.

```typescript
export default function (pi: ExtensionAPI) {
  let items: string[] = [];

  // Reconstruct state from session on load
  pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_switch", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_fork", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

  const reconstructState = (ctx: ExtensionContext) => {
    items = [];
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "message" && entry.message.role === "toolResult") {
        if (entry.message.toolName === "my_tool") {
          items = entry.message.details?.items ?? [];
        }
      }
    }
  };

  pi.registerTool({
    name: "my_tool",
    // ...
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      items.push(params.text);
      return {
        content: [{ type: "text", text: "Added" }],
        details: { items: [...items] },  // ← Snapshot full state
      };
    },
  });
}
```

**Key:** Reconstruct on ALL session change events: `session_start`, `session_switch`, `session_fork`, `session_tree`.
</tool_result_details>

<append_entry>
**For extension-private state** that doesn't participate in LLM context but needs to survive restarts:

```typescript
// Save
pi.appendEntry("my-state", { count: 42, lastRun: Date.now() });

// Restore
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "my-state") {
      const data = entry.data;  // { count: 42, lastRun: ... }
    }
  }
});
```
</append_entry>

<when_to_use_which>
| Pattern | Use When |
|---------|----------|
| Tool result `details` | State the LLM's tools produce (todo items, connection state, query results) |
| `pi.appendEntry()` | Extension-private config, timestamps, counters the LLM doesn't need |
| File on disk | Large data, config files, caches that shouldn't be in session |
</when_to_use_which>
