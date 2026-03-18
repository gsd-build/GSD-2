<overview>
Custom rendering for tools and messages — control how they appear in the TUI.
</overview>

<tool_rendering>
Tools can provide `renderCall` (how the call looks) and `renderResult` (how the result looks):

```typescript
import { Text } from "@mariozechner/pi-tui";
import { keyHint } from "@mariozechner/pi-coding-agent";

pi.registerTool({
  name: "my_tool",
  // ...

  renderCall(args, theme) {
    let text = theme.fg("toolTitle", theme.bold("my_tool "));
    text += theme.fg("muted", args.action);
    if (args.text) text += " " + theme.fg("dim", `"${args.text}"`);
    return new Text(text, 0, 0);  // 0,0 padding — Box handles it
  },

  renderResult(result, { expanded, isPartial }, theme) {
    // isPartial = true during streaming (onUpdate was called)
    if (isPartial) {
      return new Text(theme.fg("warning", "Processing..."), 0, 0);
    }

    // expanded = user toggled expand (Ctrl+O)
    if (result.details?.error) {
      return new Text(theme.fg("error", `Error: ${result.details.error}`), 0, 0);
    }

    let text = theme.fg("success", "✓ Done");
    if (!expanded) {
      text += ` (${keyHint("expandTools", "to expand")})`;
    }
    if (expanded && result.details?.items) {
      for (const item of result.details.items) {
        text += "\n  " + theme.fg("dim", item);
      }
    }
    return new Text(text, 0, 0);
  },
});
```

If you omit `renderCall`/`renderResult`, the built-in renderer is used. Useful for tool overrides where you just wrap logic without reimplementing UI.

**Fallback:** If render methods throw, `renderCall` shows tool name, `renderResult` shows raw `content` text.
</tool_rendering>

<key_hints>
Key hint helpers for showing keybinding info in render output:

```typescript
import { keyHint, appKeyHint, editorKey, rawKeyHint } from "@mariozechner/pi-coding-agent";

// Editor action hint (respects user keybinding config)
keyHint("expandTools", "to expand")    // e.g., "Ctrl+O to expand"
keyHint("selectConfirm", "to select")

// Raw key hint (always shows literal key)
rawKeyHint("Ctrl+O", "to expand")
```
</key_hints>

<message_rendering>
Register a renderer for custom message types:

```typescript
import { Text } from "@mariozechner/pi-tui";

pi.registerMessageRenderer("my-extension", (message, options, theme) => {
  const { expanded } = options;
  let text = theme.fg("accent", `[${message.customType}] `) + message.content;
  if (expanded && message.details) {
    text += "\n" + theme.fg("dim", JSON.stringify(message.details, null, 2));
  }
  return new Text(text, 0, 0);
});

// Send messages that use this renderer:
pi.sendMessage({
  customType: "my-extension",  // Matches renderer name
  content: "Status update",
  display: true,
  details: { foo: "bar" },
});
```
</message_rendering>

<syntax_highlighting>
```typescript
import { highlightCode, getLanguageFromPath } from "@mariozechner/pi-coding-agent";

const lang = getLanguageFromPath("/path/to/file.rs");  // "rust"
const highlighted = highlightCode(code, lang, theme);
```
</syntax_highlighting>

<best_practices>
- Return `Text` with padding `(0, 0)` — the wrapping `Box` handles padding
- Support `expanded` for detail on demand
- Handle `isPartial` for streaming progress
- Keep collapsed view compact
- Use `\n` for multi-line content within a single `Text`
</best_practices>
