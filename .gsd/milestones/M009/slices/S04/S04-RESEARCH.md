# S04 — Final Polish & Verification — Research

**Date:** 2026-03-18

## Summary

S04 is a polish and verification slice. Code exploration reveals three concrete gaps that need fixing, plus end-to-end browser verification.

**Gap 1: Font size not applied to View tab.** `file-content-viewer.tsx` does not import or use `useEditorFontSize`. The `CodeViewer`, `PlainViewer`, and `MarkdownViewer` components have no font size support. Only the `CodeEditor` (Edit tab) applies font size. The fix is straightforward — import the hook, apply `fontSize` via inline style on the `ReadOnlyContent` container.

**Gap 2: Shiki only loads `github-dark-default` theme.** The highlighter singleton (line 111) loads only `["github-dark-default"]`. In light mode, shiki still renders dark-themed code against a light background. Shiki v4 bundled themes include `github-light-default`. The fix: load both themes, use `useTheme()` to select the correct one at render time.

**Gap 3: CSS styles for `.file-viewer-code` and `.markdown-body` are dark-only.** All oklch values are hardcoded for dark backgrounds (e.g. `.line:hover background: oklch(0.15 0 0)`, `.markdown-body color: oklch(0.85 0 0)`, border colors at `oklch(0.22 0 0)`). No light-mode variants exist. The fix: replace hardcoded values with CSS custom properties from the existing `:root`/`.dark` design token system, or add explicit dark-scoped overrides.

## Recommendation

Fix all three gaps in two code tasks (one for the component-level fixes in TypeScript, one for the CSS), then verify everything in browser. Build already passes — run it again after changes to confirm.

## Implementation Landscape

### Key Files

- `web/components/gsd/file-content-viewer.tsx` — Needs: (1) `useEditorFontSize` import + font size applied to `ReadOnlyContent` container, (2) `useTheme` import + shiki theme selection based on `resolvedTheme`, (3) load `github-light-default` in `getHighlighter()`.
- `web/app/globals.css` — Needs light-mode variants for `.file-viewer-code` (line hover bg, line number color) and `.markdown-body` (text color, heading borders, blockquote border/color, strong color, del color, checkbox accent). Currently all values are dark-only hardcoded oklch.
- `web/components/gsd/code-editor.tsx` — No changes needed. Already handles light/dark theme switching via `useTheme()` and static `lightTheme`/`darkTheme` objects.
- `web/lib/use-editor-font-size.ts` — No changes needed. Already works.
- `web/app/api/files/route.ts` — No changes needed. POST handler is complete.

### Current State of Each Gap

**Font size (Gap 1):**
- `CodeEditor` at line 123 of `code-editor.tsx`: uses `useEditorFontSize()` and applies via `EditorView.theme` extension — working.
- `FileContentViewer`: zero references to `useEditorFontSize` or `fontSize`. The `ReadOnlyContent` wrapper renders `MarkdownViewer` or `CodeViewer` with no size customization.
- Fix: call `useEditorFontSize()` in `FileContentViewer`, apply `fontSize` as inline style on the View tab `TabsContent` container (or the `ReadOnlyContent` wrapper div). This also handles the non-tab read-only fallback path.

**Shiki theme (Gap 2):**
- `getHighlighter()` at line 109: loads `themes: ["github-dark-default"]` only.
- `CodeViewer` at line 154: hardcodes `theme: "github-dark-default"`.
- `MarkdownViewer` at line 251: hardcodes `theme: "github-dark-default"` for fenced code blocks.
- Shiki v4 (`"shiki": "^4.0.2"` in package.json) includes `github-light-default` as a bundled theme.
- Fix: load both themes in `getHighlighter()`, pass resolved theme name to `codeToHtml()`. Both `CodeViewer` and `MarkdownViewer` need the theme name — accept it as a prop from the parent which calls `useTheme()`.

**CSS light mode (Gap 3):**
- `.file-viewer-code .line:hover` uses `background: oklch(0.15 0 0)` — dark. Light should be ~`oklch(0.93 0 0)`.
- `.file-viewer-code .line::before` uses `color: oklch(0.35 0 0)` — dark. Light should match `--code-line-number` (`:root` has `oklch(0.55 0 0)`, `.dark` has `oklch(0.35 0 0)`).
- `.markdown-body` uses `color: oklch(0.85 0 0)` — light text. Light mode needs `oklch(0.2 0 0)` or similar.
- Borders at `oklch(0.22 0 0)` — need light variant ~`oklch(0.8 0 0)`.
- Blockquote border `oklch(0.3 0 0)` / color `oklch(0.6 0 0)` — need light variants.
- `strong color: oklch(0.92 0 0)` — need dark text for light bg.
- The design system already has `--foreground`, `--border`, `--muted-foreground` tokens that map to the right values in both modes. Best approach: use `var(--foreground)`, `var(--border)`, `var(--muted-foreground)` where possible. For values that don't map to existing tokens, set light defaults and scope dark overrides under `.dark`.

### Build Order

1. **T01: Component fixes (font size + shiki light theme)** — `file-content-viewer.tsx` changes: import `useEditorFontSize`, import `useTheme`, load both shiki themes, pass theme name and font size through the render tree. This is the riskiest task (touching the render chain for CodeViewer and MarkdownViewer). Verify with `npm run build:web-host`.

2. **T02: CSS light-mode variants** — `globals.css` changes: replace hardcoded dark oklch values in `.file-viewer-code` and `.markdown-body` with CSS custom properties or light-default + `.dark` overrides. Pure CSS, low risk. Verify with build.

3. **T03: End-to-end browser verification** — Start the app (`npm run build:web-host && npm run gsd:web`), open the file viewer, verify: (a) edit→save→view round-trip for a .ts file, (b) edit→save→view round-trip for a .md file, (c) font size change from settings applies to both View and Edit tabs, (d) dark/light theme switch renders correctly in both tabs. This is the final acceptance gate.

### Verification Approach

- `npm run build:web-host` exits 0 after each code task
- Browser: open a .ts file → View tab shows syntax highlighting → Edit tab shows CodeMirror → modify → Save → switch to View → content updated
- Browser: open a .md file → View tab shows rendered markdown → Edit tab shows raw markdown in CodeMirror → modify → Save → View tab shows updated render
- Browser: change editor font size in settings → View tab text size changes, Edit tab text size changes
- Browser: toggle dark/light mode → View tab (shiki) and Edit tab (CodeMirror) both render appropriate theme colors
- Browser: `.file-viewer-code` and `.markdown-body` elements have readable colors in both themes

## Constraints

- `useTheme()` (from `next-themes`) returns `resolvedTheme` which is `"dark"` or `"light"`. The component is already `"use client"` so hooks are available.
- Shiki `getHighlighter()` is a module-level singleton — loading both themes once at init is fine. The theme selection happens per-render in `codeToHtml()`.
- The `MarkdownViewer` uses shiki inside a `useEffect` with dynamic imports. The theme name needs to be reactive — when the user toggles theme, the markdown code blocks should re-highlight. Since `MarkdownViewer` already re-runs `useEffect([content, filepath])`, adding the theme to the dependency array handles this.

## Common Pitfalls

- **Shiki `getHighlighter` singleton already resolved** — If the highlighter was created with only `github-dark-default`, adding `github-light-default` later won't auto-load it. The fix must load both themes in the initial `createHighlighter()` call. Since the singleton is module-level, this is a one-line change.
- **`useTheme` hydration mismatch** — `resolvedTheme` is `undefined` on server/first render. Must handle this (default to `"dark"` when undefined, matching the current behavior). `CodeViewer` and `MarkdownViewer` already run in `useEffect` (client-only), so the resolved theme will be available by the time highlighting runs.
- **CSS specificity** — `.file-viewer-code` styles use plain class selectors. `.dark .file-viewer-code` overrides need equal or higher specificity. Using `var()` references avoids the specificity issue entirely.
