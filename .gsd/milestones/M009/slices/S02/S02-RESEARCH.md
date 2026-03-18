# S02 (CodeMirror Integration & Code Editing) — Research

**Date:** 2026-03-18

## Summary

S02 adds a CodeMirror 6 editing surface to the existing file content viewer. The current `FileContentViewer` is a pure render component receiving `content` and `filepath` props — it needs to grow View/Edit tabs, a CodeMirror editor, dirty state tracking, and a Save button that POSTs to the `/api/files` endpoint delivered in S01.

The main integration points are well-understood: `@uiw/react-codemirror` for the React wrapper, `@uiw/codemirror-themes` for `createTheme`, and `@uiw/codemirror-extensions-langs` for `loadLanguage()`. The codebase already uses dynamic `import()` for heavy modules (shiki, react-markdown) — CodeMirror should follow the same pattern. The Radix Tabs component (`web/components/ui/tabs.tsx`) is already available. Theme detection uses `next-themes` with `useTheme()` → `resolvedTheme`.

The only non-trivial piece is building two custom CodeMirror theme objects (dark/light) from the oklch design tokens in `globals.css`. The tokens are monochrome (zero chroma), so the editor chrome (background, gutter, selection, borders) maps directly from the token values. Syntax highlighting gets subtle luminance-based differentiation to stay native-looking.

## Recommendation

Build a standalone `CodeEditor` wrapper component that encapsulates all CodeMirror concerns (theme, language loading, font size). Then refactor `FileContentViewer` to add Radix Tabs for View/Edit switching, with the existing renderers in the View tab and CodeEditor in the Edit tab. Keep save orchestration simple: FileContentViewer gets new props (`root`, `path`) and handles the POST internally.

Install packages first and verify the production build passes before writing any component code — CodeMirror packages are new dependencies and bundle issues should be caught early.

## Implementation Landscape

### Key Files

- `web/components/gsd/file-content-viewer.tsx` — 364 lines. Currently exports a single `FileContentViewer` component with internal `CodeViewer` (shiki), `MarkdownViewer` (react-markdown), and `PlainViewer`. Needs: View/Edit tab UI, dirty state, Save button, CodeEditor integration. The existing sub-components (`CodeViewer`, `MarkdownViewer`, `PlainViewer`) stay unchanged as the View tab content.
- `web/components/gsd/code-editor.tsx` — **New file.** CodeMirror 6 wrapper using `@uiw/react-codemirror`. Props: `value`, `onChange`, `language` (string or null), `fontSize` (number), `className`. Handles: dynamic import of CodeMirror, custom theme creation, language extension loading, dark/light theme reactivity.
- `web/components/gsd/files-view.tsx` — Parent that renders `FileContentViewer`. Currently passes `content`, `filepath`, `className`. Needs to also pass `root` (activeRoot), `path` (selectedPath — the raw relative path without `.gsd/` prefix), and an `onSave` callback that re-fetches content after a successful POST.
- `web/lib/use-editor-font-size.ts` — Already exists from S01. `useEditorFontSize()` returns `[fontSize, setFontSize]`. Consumed by the new CodeEditor component.
- `web/app/api/files/route.ts` — POST handler already exists from S01. Call pattern: `fetch('/api/files', { method: 'POST', body: JSON.stringify({ path, content, root }) })`.
- `web/components/ui/tabs.tsx` — Radix Tabs primitives (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`) already available.
- `web/app/globals.css` — oklch design tokens. Dark: `--background: oklch(0.09 0 0)`, `--foreground: oklch(0.9 0 0)`, `--muted-foreground: oklch(0.55 0 0)`, `--accent: oklch(0.2 0 0)`, `--border: oklch(0.22 0 0)`, `--card: oklch(0.11 0 0)`. Light: `--background: oklch(0.98 0 0)`, `--foreground: oklch(0.15 0 0)`, etc. All monochrome (zero chroma).

### Package Installation

These packages are NOT yet in `web/package.json` — must be installed:
- `@uiw/react-codemirror` — React wrapper for CodeMirror 6
- `@uiw/codemirror-themes` — `createTheme` API
- `@lezer/highlight` — `tags` for syntax highlight tag styles
- `@uiw/codemirror-extensions-langs` — `loadLanguage()` for dynamic language support

### Theme Strategy

Two static theme objects built with `createTheme` — one for `theme: 'dark'`, one for `theme: 'light'`. Hardcode the oklch values from `globals.css` rather than reading CSS custom properties at runtime. Select via `useTheme()` from `next-themes` (same pattern as `shell-terminal.tsx` which uses `resolvedTheme` to switch xterm themes).

Dark theme settings (from `.dark` block):
```
background: 'oklch(0.09 0 0)'    // --background
foreground: 'oklch(0.9 0 0)'     // --foreground
caret: 'oklch(0.9 0 0)'          // --foreground
selection: 'oklch(0.2 0 0)'      // --accent
lineHighlight: 'oklch(0.12 0 0)' // between background and muted
gutterBackground: 'oklch(0.09 0 0)' // --background
gutterForeground: 'oklch(0.35 0 0)' // --code-line-number
gutterBorder: 'transparent'
```

Light theme settings (from `:root` block):
```
background: 'oklch(0.98 0 0)'    // --background
foreground: 'oklch(0.15 0 0)'    // --foreground
caret: 'oklch(0.15 0 0)'         // --foreground
selection: 'oklch(0.9 0 0)'      // --accent
lineHighlight: 'oklch(0.96 0 0)' // between background and muted
gutterBackground: 'oklch(0.98 0 0)' // --background
gutterForeground: 'oklch(0.55 0 0)' // --code-line-number
gutterBorder: 'transparent'
```

Syntax highlight styles use monochrome luminance variations (matching the zero-chroma design system):
- `t.comment` → muted-foreground
- `t.keyword`, `t.operator` → foreground with slight brightness offset
- `t.string` → slightly different luminance
- `t.number`, `t.bool`, `t.null` → slightly different luminance
- `t.variableName`, `t.definition(t.variableName)` → foreground
- `t.typeName`, `t.className` → foreground with slight brightness offset

### Language Mapping

The existing `EXT_TO_LANG` map in `file-content-viewer.tsx` uses shiki language names. The `loadLanguage()` function from `@uiw/codemirror-extensions-langs` accepts its own set of names. Most overlap directly. Build a `SHIKI_TO_CM` mapping for the exceptions:

| Shiki name | CodeMirror name (`loadLanguage`) |
|---|---|
| `typescript` | `typescript` (via `javascript({ typescript: true })`) |
| `tsx` | `tsx` |
| `jsx` | `jsx` |
| `jsonc` | `json` |
| `bash` | `shell` |
| `csharp` | `csharp` |
| `viml` | — (no CM equivalent, skip) |
| `dotenv` | — (no CM equivalent, skip) |
| `fish` | — (no CM equivalent, skip) |
| `ini` | — (no CM equivalent, skip) |

For unsupported languages, CodeEditor gracefully falls back to plain text editing (no extension).

The `detectLanguage()` function from `file-content-viewer.tsx` can be extracted or re-exported so CodeEditor can call it.

### Component Wiring

`FileContentViewer` currently receives:
```tsx
{ content: string; filepath: string; className?: string }
```

After S02 it receives additional props:
```tsx
{ content: string; filepath: string; className?: string; root?: "gsd" | "project"; path?: string; onSave?: (newContent: string) => Promise<void> }
```

When `root`/`path`/`onSave` are provided, the component renders View/Edit tabs. When they're absent, it renders the current read-only view (backward compatible).

`files-view.tsx` changes: pass `root={activeRoot}`, `path={selectedPath}`, and an `onSave` callback that POSTs and then re-sets `fileContent` state.

### Dynamic Import Pattern

The codebase already uses inline `import()` for shiki and react-markdown inside useEffect. CodeEditor should dynamically import `@uiw/react-codemirror` and the theme/language modules in the same pattern. The component renders a loading spinner until the import resolves, then mounts the CodeMirror instance. This keeps the initial bundle lean.

Since `@uiw/react-codemirror` is a React component (not just a function), `next/dynamic` is the appropriate pattern for dynamic importing it:
```tsx
const CodeMirror = dynamic(() => import('@uiw/react-codemirror').then(m => m.default), { ssr: false, loading: () => <Spinner /> })
```

Or use the same manual `import()` + state pattern used by shiki. Either works — the manual pattern is already established in this file.

### Build Order

1. **Install packages + verify build** — add the 4 npm packages, run `npm run build:web-host`. This catches any bundling or Turbopack issues immediately before any code is written.
2. **CodeEditor component** — `web/components/gsd/code-editor.tsx`. Self-contained, testable in isolation. Dynamic imports, custom theme, language loading, font size prop.
3. **FileContentViewer refactor** — Add View/Edit tabs, wire CodeEditor into Edit tab, add dirty state + Save button, wire `onSave` callback.
4. **FilesView wiring** — Pass new props (`root`, `path`, `onSave`) from `files-view.tsx` to `FileContentViewer`.
5. **Build verification** — `npm run build:web-host` exits 0.

### Verification Approach

1. `npm run build:web-host` exits 0 — confirms no bundle/type issues with CodeMirror packages
2. Browser: open any `.ts`/`.tsx` file → View tab shows shiki-highlighted code (unchanged) → click Edit tab → CodeMirror editor appears with syntax highlighting → modify code → Save button becomes active → click Save → switch to View → see updated content
3. Browser: verify dark mode and light mode both render the CodeMirror editor with matching theme
4. Browser: verify `useEditorFontSize()` font size applies to the CodeMirror editor
5. Browser: verify dirty state indicator shows when content is modified, disappears after save

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| CodeMirror React integration | `@uiw/react-codemirror` | Handles lifecycle, state sync, extension management — avoids manual EditorView management |
| Theme creation | `@uiw/codemirror-themes` `createTheme` | Provides `settings` + `styles` API that maps directly to CodeMirror's `EditorView.theme` and `syntaxHighlighting` |
| Language loading | `@uiw/codemirror-extensions-langs` `loadLanguage` | Bundles all 40+ CodeMirror language extensions with a simple name-based API — avoids individual package installs |
| Tab UI | `@radix-ui/react-tabs` (already in deps) | `web/components/ui/tabs.tsx` already wraps it. Standard accessible tabs. |

## Constraints

- CodeMirror packages must be dynamically imported — the codebase keeps initial bundle lean with `import()` for heavy modules. Shiki and react-markdown already follow this pattern.
- The View tab rendering (shiki for code, react-markdown for markdown) must be IDENTICAL to the current output — no changes to `CodeViewer`, `MarkdownViewer`, or `PlainViewer` internals.
- `createTheme` accepts hex/rgb/oklch CSS color strings in `settings` — oklch values from `globals.css` work directly (browser-native CSS).
- `next/dynamic` with `{ ssr: false }` or manual `import()` — CodeMirror requires browser APIs (`document`, DOM) and cannot SSR.
- The `files-view.tsx` POST call needs the raw relative path (e.g., `"src/index.ts"`) and root (`"gsd"` or `"project"`), not the display path (`".gsd/src/index.ts"`). The `selectedPath` and `activeRoot` state variables already hold these values.

## Common Pitfalls

- **CodeMirror re-creating on every render** — `createTheme` returns a new extension array on each call. The theme objects must be created once (module-level constants or `useMemo`) and selected by reference, not rebuilt on every render. Same for `loadLanguage()` — cache the result.
- **oklch browser support** — oklch is supported in all modern browsers (Chrome 111+, Safari 15.4+, Firefox 113+). Since this is a dev tool running locally, this is fine. But the `createTheme` settings pass CSS strings to CodeMirror's `EditorView.theme` which uses `style` attributes — oklch works there too.
- **Dynamic import race with theme/language changes** — If the user switches files rapidly while CodeMirror is still loading, the component needs a `cancelled` flag in the useEffect cleanup (same pattern already used by `CodeViewer` and `MarkdownViewer`).
- **`FileContentViewer` backward compatibility** — The component is used in `files-view.tsx`. The new props (`root`, `path`, `onSave`) must be optional. When absent, it renders the current read-only view with no tabs (preserving any other potential consumers).

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| CodeMirror | rodydavis/skills@dynamic-themes-with-codemirror | available (34 installs) |
