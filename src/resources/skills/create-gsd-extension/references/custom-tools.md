<overview>
Complete custom tools reference — registration, parameters, execution, output truncation, overrides, rendering, and dynamic registration.
</overview>

<registration>
```typescript
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

pi.registerTool({
  name: "my_tool",                    // Unique identifier (snake_case)
  label: "My Tool",                   // Display name in TUI
  description: "What this does",      // Full description shown to LLM

  // Optional: one-liner for system prompt "Available tools" section
  promptSnippet: "Manage project todo items",

  // Optional: bullets added to system prompt "Guidelines" when tool is active
  promptGuidelines: [
    "Use my_tool for task management instead of file edits."
  ],

  // Parameter schema (MUST use TypeBox)
  parameters: Type.Object({
    action: StringEnum(["list", "add", "remove"] as const),
    text: Type.Optional(Type.String({ description: "Item text" })),
    id: Type.Optional(Type.Number({ description: "Item ID" })),
  }),

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // 1. Check cancellation
    if (signal?.aborted) {
      return { content: [{ type: "text", text: "Cancelled" }] };
    }

    // 2. Stream progress (optional)
    onUpdate?.({
      content: [{ type: "text", text: "Working..." }],
      details: { progress: 50 },
    });

    // 3. Do the work
    const result = await doWork(params);

    // 4. Return result
    return {
      content: [{ type: "text", text: "Result text for LLM" }],  // Sent to LLM context
      details: { data: result },                                   // For rendering & state
    };
  },

  // Optional: custom TUI rendering
  renderCall(args, theme) { ... },
  renderResult(result, { expanded, isPartial }, theme) { ... },
});
```
</registration>

<critical_stringenum>
**⚠️ MUST use `StringEnum` for string enum parameters:**

```typescript
import { StringEnum } from "@mariozechner/pi-ai";

// ✅ Correct — works with all providers including Google
action: StringEnum(["list", "add", "remove"] as const)

// ❌ BROKEN with Google's API
action: Type.Union([Type.Literal("list"), Type.Literal("add")])
```
</critical_stringenum>

<output_truncation>
Tools MUST truncate output to avoid context overflow. Built-in limit: 50KB / 2000 lines.

```typescript
import {
  truncateHead, truncateTail, formatSize,
  DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES,
} from "@mariozechner/pi-coding-agent";

async execute(toolCallId, params, signal, onUpdate, ctx) {
  const output = await runCommand();
  const truncation = truncateHead(output, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let result = truncation.content;
  if (truncation.truncated) {
    const tempFile = writeTempFile(output);
    result += `\n\n[Output truncated: ${truncation.outputLines}/${truncation.totalLines} lines`;
    result += ` (${formatSize(truncation.outputBytes)}/${formatSize(truncation.totalBytes)}).`;
    result += ` Full output: ${tempFile}]`;
  }
  return { content: [{ type: "text", text: result }] };
}
```

Use `truncateHead` when beginning matters (search results, file reads). Use `truncateTail` when end matters (logs, command output).
</output_truncation>

<signaling_errors>
Throw to signal an error (sets `isError: true`). Returning a value never sets error flag.

```typescript
async execute(toolCallId, params) {
  if (!isValid(params.input)) {
    throw new Error(`Invalid input: ${params.input}`);
  }
  return { content: [{ type: "text", text: "OK" }], details: {} };
}
```
</signaling_errors>

<dynamic_registration>
Tools can be registered at any time — during load, in `session_start`, in command handlers. Available immediately without `/reload`.

```typescript
pi.on("session_start", async (_event, ctx) => {
  pi.registerTool({ name: "dynamic_tool", ... });
});
```

Use `pi.setActiveTools(names)` to enable/disable tools at runtime.
</dynamic_registration>

<overriding_builtins>
Register a tool with the same name as a built-in (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) to override it. **Must match exact result shape including `details` type.**

```typescript
import { createReadTool } from "@mariozechner/pi-coding-agent";

pi.registerTool({
  name: "read",
  label: "Read (Logged)",
  description: "Read file contents with logging",
  parameters: Type.Object({
    path: Type.String(),
    offset: Type.Optional(Type.Number()),
    limit: Type.Optional(Type.Number()),
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    console.log(`[AUDIT] Reading: ${params.path}`);
    const builtIn = createReadTool(ctx.cwd);
    return builtIn.execute(toolCallId, params, signal, onUpdate);
  },
  // Omit renderCall/renderResult to use built-in renderer
});
```

Start with no built-in tools: `gsd --no-tools -e ./my-extension.ts`
</overriding_builtins>

<multiple_tools>
One extension can register multiple tools with shared state:

```typescript
export default function (pi: ExtensionAPI) {
  let connection = null;

  pi.registerTool({ name: "db_connect", ... });
  pi.registerTool({ name: "db_query", ... });
  pi.registerTool({ name: "db_close", ... });

  pi.on("session_shutdown", async () => {
    connection?.close();
  });
}
```
</multiple_tools>

<path_normalization>
Some models add `@` prefix to path arguments. Strip it:

```typescript
async execute(toolCallId, params, signal, onUpdate, ctx) {
  let path = params.path;
  if (path.startsWith("@")) path = path.slice(1);
  // ...
}
```
</path_normalization>
