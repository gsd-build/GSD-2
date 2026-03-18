<overview>
The extension lifecycle from load to shutdown, including the full event flow.
</overview>

<loading>
Extensions load when GSD starts (or on `/reload`). The default export function runs synchronously — subscribe to events and register tools/commands during this call.

```
GSD starts
  └─► Extension default function runs
      ├── pi.on("event", handler)      ← Subscribe
      ├── pi.registerTool({...})       ← Register tools
      ├── pi.registerCommand(...)      ← Register commands
      └── pi.registerShortcut(...)     ← Register shortcuts
  └─► session_start fires
```
</loading>

<event_flow>
Full event flow per user prompt:

```
user sends prompt
  ├─► Extension commands checked (bypass if match)
  ├─► input event (can intercept/transform/handle)
  ├─► Skill/template expansion
  ├─► before_agent_start (inject message, modify system prompt)
  ├─► agent_start
  │
  │   ┌── Turn loop (repeats while LLM calls tools) ──┐
  │   │ turn_start                                     │
  │   │ context (can modify messages sent to LLM)      │
  │   │ before_provider_request (inspect/replace payload)│
  │   │ LLM responds → may call tools:                 │
  │   │   tool_call (can BLOCK)                        │
  │   │   tool_execution_start/update/end              │
  │   │   tool_result (can MODIFY)                     │
  │   │ turn_end                                       │
  │   └────────────────────────────────────────────────┘
  │
  └─► agent_end
```
</event_flow>

<session_events>
| Event | When | Can Return |
|-------|------|------------|
| `session_start` | Session loads | — |
| `session_before_switch` | Before `/new` or `/resume` | `{ cancel: true }` |
| `session_switch` | After switch | — |
| `session_before_fork` | Before `/fork` | `{ cancel: true }`, `{ skipConversationRestore: true }` |
| `session_fork` | After fork | — |
| `session_before_compact` | Before compaction | `{ cancel: true }`, `{ compaction: {...} }` |
| `session_compact` | After compaction | — |
| `session_shutdown` | On exit | — |
</session_events>

<hot_reload>
Extensions in auto-discovered locations hot-reload with `/reload`:
- `session_shutdown` fires for old runtime
- Resources re-scanned
- `session_start` fires for new runtime
- Code after `await ctx.reload()` still runs from the pre-reload version — treat as terminal
</hot_reload>
