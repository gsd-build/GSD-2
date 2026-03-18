<overview>
Complete custom UI reference — dialogs, persistent elements, custom components, overlays, custom editors, built-in components, keyboard input, performance, theming, and common mistakes.
</overview>

<ui_architecture>
```
┌─────────────────────────────────────────────────┐
│  Custom Header (ctx.ui.setHeader)               │
├─────────────────────────────────────────────────┤
│  Message Area                                   │
│  - User/assistant messages                      │
│  - Tool calls ◄── renderCall/renderResult       │
│  - Custom messages ◄── registerMessageRenderer  │
├─────────────────────────────────────────────────┤
│  Widgets (above editor) ◄── ctx.ui.setWidget    │
├─────────────────────────────────────────────────┤
│  Editor ◄── ctx.ui.custom() / setEditorComponent│
├─────────────────────────────────────────────────┤
│  Widgets (below editor) ◄── ctx.ui.setWidget    │
├─────────────────────────────────────────────────┤
│  Footer ◄── ctx.ui.setFooter / setStatus        │
└─────────────────────────────────────────────────┘
  ┌─────────────────────┐
  │  Overlay (floating)  │ ◄── ctx.ui.custom({ overlay })
  └─────────────────────┘
```

**11 ways to get UI on screen:**

| Method | Blocks? | Replaces editor? |
|--------|---------|-------------------|
| `ctx.ui.select/confirm/input/editor` | Yes | Temporarily |
| `ctx.ui.notify` | No | No |
| `ctx.ui.setStatus` | No | No (footer) |
| `ctx.ui.setWidget` | No | No |
| `ctx.ui.setFooter` | No | No (replaces footer) |
| `ctx.ui.setHeader` | No | No (replaces header) |
| `ctx.ui.custom()` | Yes | Temporarily |
| `ctx.ui.custom({overlay})` | Yes | No (renders on top) |
| `ctx.ui.setEditorComponent` | No | Yes (permanently) |
| `renderCall/renderResult` | No | No (inline in messages) |
| `registerMessageRenderer` | No | No (inline in messages) |
</ui_architecture>

<component_interface>
Every visual element implements:

```typescript
interface Component {
  render(width: number): string[];   // Required — each line ≤ width visible chars
  handleInput?(data: string): void;  // Optional — receive keyboard input
  wantsKeyRelease?: boolean;         // Optional — receive key release events (Kitty protocol)
  invalidate(): void;                // Required — clear cached render state
}
```

**Render contract:**
- Return array of strings, one per line
- Each string MUST NOT exceed `width` in visible characters
- ANSI escape codes don't count toward visible width
- **Styles are reset at end of each line** — reapply per line
- Return `[]` for zero-height component

**Invalidation contract:**
- Clear ALL cached render output
- Clear any pre-baked themed strings
- Call `super.invalidate()` if extending a built-in component
</component_interface>

<dialogs>
Blocking dialog methods on `ctx.ui`:

```typescript
const choice = await ctx.ui.select("Pick one:", ["A", "B", "C"]);       // string | undefined
const ok = await ctx.ui.confirm("Delete?", "This cannot be undone");    // boolean
const name = await ctx.ui.input("Name:", "placeholder");                // string | undefined
const text = await ctx.ui.editor("Edit:", "prefilled text");            // string | undefined

// Timed auto-dismiss with countdown
const ok = await ctx.ui.confirm("Proceed?", "Auto-continues in 5s", { timeout: 5000 });
// Returns false on timeout, undefined for select/input

// Manual dismissal with AbortSignal (distinguish timeout from cancel)
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);
const ok = await ctx.ui.confirm("Timed", "Auto-cancels in 5s", { signal: controller.signal });
clearTimeout(timeoutId);
if (controller.signal.aborted) { /* timed out */ }
```
</dialogs>

<persistent_ui>
```typescript
// Footer status (multiple extensions can set independent entries)
ctx.ui.setStatus("my-ext", "● Active");
ctx.ui.setStatus("my-ext", undefined);  // Clear

// Widgets
ctx.ui.setWidget("my-id", ["Line 1", "Line 2"]);                       // Above editor
ctx.ui.setWidget("my-id", ["Below"], { placement: "belowEditor" });    // Below editor
ctx.ui.setWidget("my-id", (_tui, theme) => ({                          // Themed
  render: () => [theme.fg("accent", "Styled")],
  invalidate: () => {},
}));
ctx.ui.setWidget("my-id", undefined);  // Clear

// Working message during streaming
ctx.ui.setWorkingMessage("Analyzing code...");
ctx.ui.setWorkingMessage();  // Restore default

// Custom footer (full replacement)
ctx.ui.setFooter((tui, theme, footerData) => ({
  render(width) {
    const branch = footerData.getGitBranch();          // Only available here
    const statuses = footerData.getExtensionStatuses(); // All setStatus values
    return [truncateToWidth(`${branch} | model`, width)];
  },
  invalidate() {},
  dispose: footerData.onBranchChange(() => tui.requestRender()),  // Reactive
}));
ctx.ui.setFooter(undefined);  // Restore default

// Custom header
ctx.ui.setHeader((tui, theme) => ({
  render(width) { return [theme.fg("accent", theme.bold("My Header"))]; },
  invalidate() {},
}));

// Editor control
ctx.ui.setEditorText("Prefill");
const current = ctx.ui.getEditorText();
ctx.ui.pasteToEditor("pasted content");  // Triggers paste handling

// Tool expansion
ctx.ui.setToolsExpanded(true);
const expanded = ctx.ui.getToolsExpanded();

// Theme management
const themes = ctx.ui.getAllThemes();
ctx.ui.setTheme("light");
ctx.ui.theme.fg("accent", "text");  // Access current theme
```
</persistent_ui>

<custom_components>
`ctx.ui.custom()` temporarily replaces the editor. Returns a value when `done()` is called.

**Factory callback args:**

| Argument | Type | Purpose |
|----------|------|---------|
| `tui` | `TUI` | `tui.requestRender()` triggers re-render after state changes |
| `theme` | `Theme` | Current theme for styling |
| `keybindings` | `KeybindingsManager` | App keybinding config |
| `done` | `(value: T) => void` | Close component and return value |

**Inline pattern:**
```typescript
const result = await ctx.ui.custom<string | null>((tui, theme, keybindings, done) => ({
  render(width: number): string[] {
    return [truncateToWidth("Press Enter to confirm, Escape to cancel", width)];
  },
  handleInput(data: string) {
    if (matchesKey(data, Key.enter)) done("confirmed");
    if (matchesKey(data, Key.escape)) done(null);
  },
  invalidate() {},
}));
```

**Class-based pattern (recommended for complex UI):**
```typescript
class MyComponent {
  private selected = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private tui: { requestRender: () => void },
    private theme: Theme,
    private items: string[],
    private done: (value: string | null) => void,
  ) {}

  handleInput(data: string) {
    if (matchesKey(data, Key.up) && this.selected > 0) this.selected--;
    else if (matchesKey(data, Key.down) && this.selected < this.items.length - 1) this.selected++;
    else if (matchesKey(data, Key.enter)) { this.done(this.items[this.selected]); return; }
    else if (matchesKey(data, Key.escape)) { this.done(null); return; }
    else return;
    this.invalidate();
    this.tui.requestRender();
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    this.cachedLines = this.items.map((item, i) =>
      truncateToWidth((i === this.selected ? "> " : "  ") + item, width)
    );
    this.cachedWidth = width;
    return this.cachedLines;
  }

  invalidate() { this.cachedWidth = undefined; this.cachedLines = undefined; }
}

const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) =>
  new MyComponent(tui, theme, ["A", "B", "C"], done)
);
```

**Composing with built-in components:**
```typescript
const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
  const container = new Container();
  container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
  container.addChild(new Text(theme.fg("accent", theme.bold("Title")), 1, 0));

  const selectList = new SelectList(items, 10, {
    selectedPrefix: (t) => theme.fg("accent", t),
    selectedText: (t) => theme.fg("accent", t),
    description: (t) => theme.fg("muted", t),
    scrollInfo: (t) => theme.fg("dim", t),
    noMatch: (t) => theme.fg("warning", t),
  });
  selectList.onSelect = (item) => done(item.value);
  selectList.onCancel = () => done(null);
  container.addChild(selectList);

  return {
    render: (w) => container.render(w),
    invalidate: () => container.invalidate(),
    handleInput: (data) => { selectList.handleInput(data); tui.requestRender(); },
  };
});
```
</custom_components>

<overlays>
Floating modals rendered on top of everything:

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, _kb, done) => new MyDialog({ onClose: done }),
  {
    overlay: true,
    overlayOptions: {
      anchor: "center",         // 9 positions (see below)
      width: "50%",             // number = columns, string = percentage
      minWidth: 40,
      maxHeight: "80%",
      margin: 2,                // All sides, or { top, right, bottom, left }
      offsetX: 0, offsetY: 0,  // Fine-tune position
      visible: (w, h) => w >= 80,  // Hide on narrow terminals
    },
    onHandle: (handle) => {
      // handle.setHidden(true/false) — temporarily hide
      // handle.hide() — permanently remove
    },
  }
);
```

**Anchor positions:**
```
top-left      top-center      top-right
left-center      center      right-center
bottom-left  bottom-center  bottom-right
```

**Stacked overlays:** Multiple overlays stack (newest on top). Closing one gives focus to the one below.

**⚠️ Overlay lifecycle:** Components are disposed when closed. Never reuse references — create fresh instances each time.
</overlays>

<custom_editor>
Replace the main input editor permanently:

```typescript
import { CustomEditor } from "@mariozechner/pi-coding-agent";

class VimEditor extends CustomEditor {
  private mode: "normal" | "insert" = "insert";

  handleInput(data: string): void {
    if (matchesKey(data, "escape") && this.mode === "insert") {
      this.mode = "normal"; return;
    }
    if (this.mode === "insert") { super.handleInput(data); return; }
    switch (data) {
      case "i": this.mode = "insert"; return;
      case "h": super.handleInput("\x1b[D"); return;  // Left
      case "j": super.handleInput("\x1b[B"); return;  // Down
      case "k": super.handleInput("\x1b[A"); return;  // Up
      case "l": super.handleInput("\x1b[C"); return;  // Right
    }
    if (data.length === 1 && data.charCodeAt(0) >= 32) return;  // Block printable in normal
    super.handleInput(data);
  }
}

ctx.ui.setEditorComponent((_tui, theme, keybindings) => new VimEditor(theme, keybindings));
ctx.ui.setEditorComponent(undefined);  // Restore default
```

**Critical:** Extend `CustomEditor` (NOT `Editor`) to get app keybindings (escape to abort, ctrl+d, model switching).
</custom_editor>

<built_in_components>
**From `@mariozechner/pi-tui`:**

| Component | Constructor | Purpose |
|-----------|-------------|---------|
| `Text` | `new Text(content, paddingX, paddingY, bgFn?)` | Multi-line text with word wrap |
| `Box` | `new Box(paddingX, paddingY, bgFn)` | Container with padding+background, `.addChild()` |
| `Container` | `new Container()` | Vertical stack, `.addChild()`, `.removeChild()`, `.clear()` |
| `Spacer` | `new Spacer(lines)` | Empty vertical space |
| `Markdown` | `new Markdown(content, padX, padY, getMarkdownTheme())` | Rendered markdown with syntax highlighting |
| `Image` | `new Image(base64, mimeType, theme, opts?)` | Image rendering (Kitty, iTerm2) |
| `SelectList` | `new SelectList(items, maxVisible, themeOpts)` | Interactive selection with search and scrolling |
| `SettingsList` | `new SettingsList(items, maxVisible, theme, onChange, onClose, opts?)` | Toggle settings with left/right arrows |
| `Input` | `new Input()` | Text input field |
| `Editor` | `new Editor(tui, editorTheme)` | Multi-line editor with undo |

**SelectList usage:**
```typescript
const items: SelectItem[] = [
  { value: "opt1", label: "Option 1", description: "First option" },
  { value: "opt2", label: "Option 2" },
];
const selectList = new SelectList(items, 10, {
  selectedPrefix: (t) => theme.fg("accent", t),
  selectedText: (t) => theme.fg("accent", t),
  description: (t) => theme.fg("muted", t),
  scrollInfo: (t) => theme.fg("dim", t),
  noMatch: (t) => theme.fg("warning", t),
});
selectList.onSelect = (item) => { /* item.value */ };
selectList.onCancel = () => { /* escape pressed */ };
```

**SettingsList usage:**
```typescript
const items: SettingItem[] = [
  { id: "verbose", label: "Verbose mode", currentValue: "off", values: ["on", "off"] },
  { id: "theme", label: "Theme", currentValue: "dark", values: ["dark", "light", "auto"] },
];
const settings = new SettingsList(items, 15, getSettingsListTheme(),
  (id, newValue) => { /* setting changed */ },
  () => { /* close requested */ },
  { enableSearch: true },
);
```

**From `@mariozechner/pi-coding-agent`:**

| Component | Constructor | Purpose |
|-----------|-------------|---------|
| `DynamicBorder` | `new DynamicBorder((s: string) => theme.fg("accent", s))` | Border line |
| `BorderedLoader` | — | Spinner with cancel support |
| `CustomEditor` | `new CustomEditor(theme, keybindings)` | Base class for custom editors |
</built_in_components>

<keyboard_input>
```typescript
import { matchesKey, Key } from "@mariozechner/pi-tui";

handleInput(data: string) {
  // Basic keys
  if (matchesKey(data, Key.up)) {}
  if (matchesKey(data, Key.down)) {}
  if (matchesKey(data, Key.enter)) {}
  if (matchesKey(data, Key.escape)) {}
  if (matchesKey(data, Key.tab)) {}
  if (matchesKey(data, Key.space)) {}
  if (matchesKey(data, Key.backspace)) {}
  if (matchesKey(data, Key.home)) {}
  if (matchesKey(data, Key.end)) {}

  // With modifiers
  if (matchesKey(data, Key.ctrl("c"))) {}
  if (matchesKey(data, Key.shift("tab"))) {}
  if (matchesKey(data, Key.alt("left"))) {}
  if (matchesKey(data, Key.ctrlShift("p"))) {}

  // String format also works: "enter", "ctrl+c", "shift+tab"

  // Printable character detection
  if (data.length === 1 && data.charCodeAt(0) >= 32) {
    // Letter, number, symbol
  }
}
```

**handleInput contract:**
1. Check for your keys
2. Update state
3. Call `this.invalidate()` if render output changes
4. Call `tui.requestRender()` to trigger re-render
</keyboard_input>

<line_width_rule>
**Cardinal rule: each line from render() must not exceed `width` visible characters.**

```typescript
import { visibleWidth, truncateToWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";

visibleWidth("\x1b[32mHello\x1b[0m");  // Returns 5 (ignores ANSI codes)
truncateToWidth("Very long text here", 10);         // "Very lo..."
truncateToWidth("Very long text here", 10, "");      // "Very long " (no ellipsis)
wrapTextWithAnsi("\x1b[32mLong green text\x1b[0m", 10);  // Word wrap preserving ANSI
```

If lines exceed `width`, terminal wraps cause visual corruption.
</line_width_rule>

<performance_caching>
Always cache render output:

```typescript
class CachedComponent {
  private cachedWidth?: number;
  private cachedLines?: string[];

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    const lines = this.computeLines(width);
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate() { this.cachedWidth = undefined; this.cachedLines = undefined; }
}
```

**Update cycle:** State changes → `invalidate()` → `tui.requestRender()` → `render(width)` called

**Game loop pattern** (real-time updates):
```typescript
this.interval = setInterval(() => {
  this.tick();
  this.version++;
  this.tui.requestRender();
}, 100);  // 10 FPS

// Clean up in dispose()
clearInterval(this.interval);
```
</performance_caching>

<theme_colors>
Always use theme from callback params, never import directly.

**All foreground colors:**

| Category | Colors |
|----------|--------|
| General | `text`, `accent`, `muted`, `dim` |
| Status | `success`, `error`, `warning` |
| Borders | `border`, `borderAccent`, `borderMuted` |
| Messages | `userMessageText`, `customMessageText`, `customMessageLabel` |
| Tools | `toolTitle`, `toolOutput` |
| Diffs | `toolDiffAdded`, `toolDiffRemoved`, `toolDiffContext` |
| Markdown | `mdHeading`, `mdLink`, `mdLinkUrl`, `mdCode`, `mdCodeBlock`, `mdCodeBlockBorder`, `mdQuote`, `mdQuoteBorder`, `mdHr`, `mdListBullet` |
| Syntax | `syntaxComment`, `syntaxKeyword`, `syntaxFunction`, `syntaxVariable`, `syntaxString`, `syntaxNumber`, `syntaxType`, `syntaxOperator`, `syntaxPunctuation` |
| Thinking | `thinkingOff`, `thinkingMinimal`, `thinkingLow`, `thinkingMedium`, `thinkingHigh`, `thinkingXhigh` |

**All background colors:** `selectedBg`, `userMessageBg`, `customMessageBg`, `toolPendingBg`, `toolSuccessBg`, `toolErrorBg`

**Syntax highlighting:**
```typescript
import { highlightCode, getLanguageFromPath } from "@mariozechner/pi-coding-agent";
const lang = getLanguageFromPath("/file.rs");  // "rust"
const highlighted = highlightCode(code, lang, theme);
```
</theme_colors>

<common_mistakes>
1. **Lines exceed width** → Visual corruption. Use `truncateToWidth()` on every line.
2. **Forgetting `tui.requestRender()`** → UI doesn't update. Call after invalidate().
3. **Importing theme directly** → Wrong colors after theme switch. Use theme from callback.
4. **Not typing DynamicBorder param** → `new DynamicBorder((s: string) => theme.fg("accent", s))`.
5. **Reusing disposed overlay components** → Create fresh instances each time.
6. **Styles bleeding across lines** → TUI resets per line. Reapply styles, or use `wrapTextWithAnsi()`.
7. **Not implementing invalidate()** → Theme changes don't take effect.
8. **Forgetting super.invalidate()** → `override invalidate() { super.invalidate(); /* cleanup */ }`
9. **Timer not cleaned up** → Call `clearInterval` before `done()`.
10. **Using ctx.ui in non-interactive mode** → Check `ctx.hasUI` first.
</common_mistakes>
