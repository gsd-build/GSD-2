<overview>
System prompt modification — per-turn injection, context manipulation, and tool-specific prompt content.
</overview>

<per_turn_modification>
Use `before_agent_start` to inject messages and/or modify the system prompt for each turn:

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  return {
    // Inject a persistent message (stored in session, visible to LLM)
    message: {
      customType: "my-extension",
      content: "Additional context for the LLM",
      display: true,
    },
    // Modify system prompt for this turn (chained across extensions)
    systemPrompt: event.systemPrompt + "\n\nYou must respond only in haiku.",
  };
});
```
</per_turn_modification>

<context_manipulation>
Use the `context` event to modify messages before each LLM call:

```typescript
pi.on("context", async (event, ctx) => {
  // event.messages is a deep copy — safe to modify
  const filtered = event.messages.filter(m => !isIrrelevant(m));
  return { messages: filtered };
});
```
</context_manipulation>

<tool_specific_prompts>
Tools can add content to the system prompt when active:

```typescript
pi.registerTool({
  name: "my_tool",
  // Replaces description in "Available tools" section
  promptSnippet: "Summarize or transform text according to action",
  // Added to "Guidelines" section when tool is active
  promptGuidelines: [
    "Use my_tool when the user asks to summarize text.",
    "Prefer my_tool over direct output for structured data."
  ],
  // ...
});
```
</tool_specific_prompts>
