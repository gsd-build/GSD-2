<overview>
Custom compaction hooks, triggering compaction, and session control methods available only in command handlers.
</overview>

<custom_compaction>
Override default compaction behavior:

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, signal } = event;

  // Option 1: Cancel
  return { cancel: true };

  // Option 2: Custom summary
  return {
    compaction: {
      summary: "Custom summary of conversation so far...",
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
    }
  };
});
```
</custom_compaction>

<trigger_compaction>
Trigger compaction programmatically from any handler:

```typescript
ctx.compact({
  customInstructions: "Focus on the authentication changes",
  onComplete: (result) => ctx.ui.notify("Compacted!", "info"),
  onError: (error) => ctx.ui.notify(`Failed: ${error.message}`, "error"),
});
```
</trigger_compaction>

<session_control>
**Only available in command handlers** (deadlocks in event handlers):

```typescript
pi.registerCommand("handoff", {
  handler: async (args, ctx) => {
    await ctx.waitForIdle();

    // Create new session with initial context
    const result = await ctx.newSession({
      parentSession: ctx.sessionManager.getSessionFile(),
      setup: async (sm) => {
        sm.appendMessage({
          role: "user",
          content: [{ type: "text", text: `Context: ${args}` }],
          timestamp: Date.now(),
        });
      },
    });

    if (result.cancelled) { /* extension cancelled via session_before_switch */ }
  },
});
```

| Method | Purpose |
|--------|---------|
| `ctx.waitForIdle()` | Wait for agent to finish streaming |
| `ctx.newSession(options?)` | Create a new session |
| `ctx.fork(entryId)` | Fork from a specific entry |
| `ctx.navigateTree(targetId, options?)` | Navigate session tree (with optional summary) |
| `ctx.reload()` | Hot-reload everything (treat as terminal — code after runs pre-reload version) |

`navigateTree` options:
- `summarize: boolean` — generate summary of abandoned branch
- `customInstructions: string` — instructions for summarizer
- `replaceInstructions: boolean` — replace default prompt entirely
- `label: string` — label to attach to branch summary
</session_control>
