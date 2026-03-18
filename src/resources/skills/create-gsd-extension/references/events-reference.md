<overview>
Complete event reference with handler signatures, return types, and type narrowing utilities.
</overview>

<event_categories>

**Session events:** `session_start`, `session_before_switch`, `session_switch`, `session_before_fork`, `session_fork`, `session_before_compact`, `session_compact`, `session_before_tree`, `session_tree`, `session_shutdown`

**Agent events:** `before_agent_start`, `agent_start`, `agent_end`, `turn_start`, `turn_end`, `context`, `before_provider_request`, `message_start`, `message_update`, `message_end`

**Tool events:** `tool_call`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `tool_result`

**Input events:** `input`

**Model events:** `model_select`

**User bash events:** `user_bash`

**Special:** `session_directory` (CLI startup only, no `ctx` — receives only event)

</event_categories>

<handler_signature>
```typescript
pi.on("event_name", async (event, ctx: ExtensionContext) => {
  // event — typed payload for this event
  // ctx — access to UI, session, model, control flow
  // Return undefined for no action, or a typed response
});
```
</handler_signature>

<key_events>

**before_agent_start** — Fired after user prompt, before agent loop. Primary hook for context injection and system prompt modification.
```typescript
pi.on("before_agent_start", async (event, ctx) => {
  // event.prompt — user's prompt text
  // event.images — attached images
  // event.systemPrompt — current system prompt
  return {
    message: { customType: "my-ext", content: "Extra context", display: true },
    systemPrompt: event.systemPrompt + "\n\nExtra instructions...",
  };
});
```

**tool_call** — Fired before tool executes. Can block.
```typescript
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

pi.on("tool_call", async (event, ctx) => {
  if (isToolCallEventType("bash", event)) {
    // event.input is typed as { command: string; timeout?: number }
    if (event.input.command.includes("rm -rf")) {
      return { block: true, reason: "Dangerous command" };
    }
  }
});
```

**tool_result** — Fired after tool executes. Can modify result. Handlers chain like middleware.
```typescript
import { isBashToolResult } from "@mariozechner/pi-coding-agent";

pi.on("tool_result", async (event, ctx) => {
  if (isBashToolResult(event)) {
    // event.details is typed as BashToolDetails
  }
  // Return partial patch: { content, details, isError }
  // Omitted fields keep current values
});
```

**context** — Fired before each LLM call. Modify messages non-destructively.
```typescript
pi.on("context", async (event, ctx) => {
  // event.messages is a deep copy — safe to modify
  const filtered = event.messages.filter(m => !shouldPrune(m));
  return { messages: filtered };
});
```

**input** — Fired when user input is received, before skill/template expansion.
```typescript
pi.on("input", async (event, ctx) => {
  // event.text — raw input
  // event.source — "interactive", "rpc", or "extension"
  if (event.text.startsWith("?quick "))
    return { action: "transform", text: `Respond briefly: ${event.text.slice(7)}` };
  return { action: "continue" };
});
```

**model_select** — Fired when model changes.
```typescript
pi.on("model_select", async (event, ctx) => {
  // event.model, event.previousModel, event.source ("set"|"cycle"|"restore")
});
```

</key_events>

<type_narrowing>
Built-in type guards for tool events:

```typescript
import { isToolCallEventType, isBashToolResult } from "@mariozechner/pi-coding-agent";

// Tool calls — narrows event.input type
if (isToolCallEventType("bash", event)) { /* event.input: { command, timeout? } */ }
if (isToolCallEventType("read", event)) { /* event.input: { path, offset?, limit? } */ }
if (isToolCallEventType("write", event)) { /* event.input: { path, content } */ }
if (isToolCallEventType("edit", event)) { /* event.input: { path, oldText, newText } */ }

// Tool results — narrows event.details type
if (isBashToolResult(event)) { /* event.details: BashToolDetails */ }
```

For custom tools, export your input type and use explicit type params:
```typescript
if (isToolCallEventType<"my_tool", MyToolInput>("my_tool", event)) {
  event.input.action; // typed
}
```
</type_narrowing>
