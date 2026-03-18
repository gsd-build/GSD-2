<overview>
ExtensionAPI methods — the `pi` object received in the default export function.
</overview>

<core_registration>
| Method | Purpose |
|--------|---------|
| `pi.on(event, handler)` | Subscribe to events |
| `pi.registerTool(definition)` | Register LLM-callable tool |
| `pi.registerCommand(name, options)` | Register `/command` |
| `pi.registerShortcut(key, options)` | Register keyboard shortcut |
| `pi.registerFlag(name, options)` | Register CLI flag |
| `pi.registerMessageRenderer(customType, renderer)` | Custom message rendering |
| `pi.registerProvider(name, config)` | Register/override model provider |
| `pi.unregisterProvider(name)` | Remove a provider |
</core_registration>

<messaging>
| Method | Purpose |
|--------|---------|
| `pi.sendMessage(message, options?)` | Inject custom message into session |
| `pi.sendUserMessage(content, options?)` | Send user message (triggers turn) |

**Delivery modes for `sendMessage`:**
- `"steer"` (default) — Interrupts streaming after current tool
- `"followUp"` — Waits for agent to finish all tools
- `"nextTurn"` — Queued for next user prompt

```typescript
pi.sendMessage({
  customType: "my-extension",
  content: "Additional context",
  display: true,
  details: { ... },
}, { deliverAs: "steer", triggerTurn: true });
```
</messaging>

<state_session>
| Method | Purpose |
|--------|---------|
| `pi.appendEntry(customType, data?)` | Persist state (NOT sent to LLM) |
| `pi.setSessionName(name)` | Set session display name |
| `pi.getSessionName()` | Get session name |
| `pi.setLabel(entryId, label)` | Bookmark entry for `/tree` |
</state_session>

<tool_management>
```typescript
const active = pi.getActiveTools();    // ["read", "bash", "edit", "write"]
const all = pi.getAllTools();          // [{ name, description }, ...]
pi.setActiveTools(["read", "bash"]);  // Enable/disable tools
```
</tool_management>

<model_management>
```typescript
const model = ctx.modelRegistry.find("anthropic", "claude-sonnet-4-5");
if (model) {
  const success = await pi.setModel(model);  // Returns false if no API key
}

pi.getThinkingLevel();               // "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
pi.setThinkingLevel("high");
```
</model_management>

<utilities>
| Method | Purpose |
|--------|---------|
| `pi.exec(cmd, args, opts?)` | Shell command (prefer over child_process) |
| `pi.events` | Shared event bus for inter-extension communication |
| `pi.getFlag(name)` | Get CLI flag value |
| `pi.getCommands()` | All available slash commands |
</utilities>
