<overview>
ExtensionContext (`ctx`) — available in all event handlers (except `session_directory`).
</overview>

<ui_methods>
**Dialogs (blocking — wait for user response):**
```typescript
const choice = await ctx.ui.select("Pick one:", ["A", "B", "C"]);
const ok = await ctx.ui.confirm("Delete?", "This cannot be undone");
const name = await ctx.ui.input("Name:", "placeholder");
const text = await ctx.ui.editor("Edit:", "prefilled text");

// Timed dialog — auto-dismiss after timeout
const ok = await ctx.ui.confirm("Auto-confirm?", "Proceeds in 5s", { timeout: 5000 });
```

**Non-blocking UI:**
```typescript
ctx.ui.notify("Done!", "info");                     // Toast: "info" | "warning" | "error"
ctx.ui.setStatus("my-ext", "● Active");             // Footer status
ctx.ui.setStatus("my-ext", undefined);              // Clear
ctx.ui.setWidget("my-id", ["Line 1", "Line 2"]);   // Widget above editor
ctx.ui.setWidget("my-id", ["Below!"], { placement: "belowEditor" });
ctx.ui.setTitle("gsd - my project");                 // Terminal title
ctx.ui.setEditorText("Prefill");                    // Set editor content
ctx.ui.setWorkingMessage("Analyzing...");           // Working message during streaming
ctx.ui.setToolsExpanded(true);                      // Expand tool output
```
</ui_methods>

<ctx_properties>
| Property/Method | Purpose |
|----------------|---------|
| `ctx.hasUI` | `false` in print/JSON mode — check before dialogs |
| `ctx.cwd` | Current working directory |
| `ctx.sessionManager` | Read-only session state |
| `ctx.modelRegistry` / `ctx.model` | Model access |
| `ctx.isIdle()` / `ctx.abort()` / `ctx.hasPendingMessages()` | Agent state |
| `ctx.shutdown()` | Request graceful exit (deferred until idle) |
| `ctx.getContextUsage()` | Current context token usage |
| `ctx.compact(options?)` | Trigger compaction |
| `ctx.getSystemPrompt()` | Current effective system prompt |
</ctx_properties>

<session_manager>
```typescript
ctx.sessionManager.getEntries()       // All entries
ctx.sessionManager.getBranch()        // Current branch
ctx.sessionManager.getLeafId()        // Current leaf entry ID
ctx.sessionManager.getSessionFile()   // Session JSONL path
ctx.sessionManager.getLabel(entryId)  // Entry label
```
</session_manager>
