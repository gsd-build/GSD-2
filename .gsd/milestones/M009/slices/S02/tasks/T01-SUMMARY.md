---
id: T01
parent: S02
milestone: M009
provides:
  - CodeEditor React component wrapping @uiw/react-codemirror with custom themes, dynamic language loading, and font size support
  - Four CodeMirror npm packages installed in web/package.json
key_files:
  - web/components/gsd/code-editor.tsx
  - web/package.json
key_decisions:
  - Used @uiw/codemirror-extensions-langs short names (ts, js, py, rb, rs, etc.) instead of full language names — the library's loadLanguage() only works with these short forms
  - Languages without CM support (graphql, dockerfile, makefile, viml, dotenv, fish) fall back to plain text editing
  - mdx maps to markdown (no dedicated CM mdx mode)
patterns_established:
  - CodeMirror wrapped via next/dynamic ssr:false with Loader2 spinner fallback
  - Static module-level theme objects (never recreated on render) for dark/light
  - Language extension cached via useMemo keyed on mapped language name
  - Font size applied via EditorView.theme extension (memoized on fontSize)
observability_surfaces:
  - Dynamic import failure: Loader2 spinner stays visible indefinitely; browser console logs import error
  - Language fallback: unsupported languages render as plain text (no extension loaded)
  - Theme diagnostic: hardcoded oklch values in static darkTheme/lightTheme constants
duration: 15m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Install CodeMirror packages and build CodeEditor component

**Built standalone CodeEditor component with dynamic import, monochrome oklch themes, language mapping for 30+ extensions, and font size support.**

## What Happened

1. Installed four CodeMirror packages: `@uiw/react-codemirror`, `@uiw/codemirror-themes`, `@lezer/highlight`, `@uiw/codemirror-extensions-langs`.
2. Verified production build passes after install (`npm run build:web-host` exit 0).
3. Built `web/components/gsd/code-editor.tsx`:
   - Dynamic import via `next/dynamic` with `ssr: false` and Loader2 spinner fallback
   - Two static theme objects (dark/light) using oklch values matching globals.css design tokens
   - Monochrome syntax highlighting styles (zero-chroma, luminance variations only)
   - `CM_LANG_MAP` mapping 30+ shiki language names to CodeMirror `loadLanguage()` short names
   - `useTheme()` reactive theme switching (dark default, light when resolvedTheme === 'light')
   - Font size via `EditorView.theme` extension, memoized on fontSize
   - Combined extensions array memoized to prevent re-initialization
4. Verified production build passes after component creation.
5. Verified no new type errors from `code-editor.tsx` (all tsc errors are pre-existing).

## Verification

- `npm run build:web-host` exits 0 after package install ✅
- `npm run build:web-host` exits 0 after component creation ✅
- `npx tsc --noEmit` — no new errors from code-editor.tsx (all errors pre-existing) ✅
- `code-editor.tsx` exists and exports `CodeEditor` ✅
- Four CodeMirror packages in web/package.json ✅
- No existing files modified (pure additive — only package.json deps and new file) ✅

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm run build:web-host` (post-install) | 0 | PASS | ~8s |
| 2 | `npm run build:web-host` (post-component) | 0 | PASS | ~8s |
| 3 | `npx tsc --noEmit` | 1 (pre-existing only) | PASS | ~10s |
| 4 | `ls web/components/gsd/code-editor.tsx` | 0 | PASS | — |
| 5 | `grep codemirror web/package.json` | 0 | PASS | — |

### Slice-level verification (partial — T01 is intermediate)
- `npm run build:web-host` exits 0 ✅
- Browser: View/Edit tabs, edit→save→view round-trip — not yet (requires T02 integration)
- Browser: CodeMirror dark/light themes — not yet (requires T02 integration)
- Browser: editor font size from useEditorFontSize — not yet (requires T02 integration)

## Diagnostics

- If CodeMirror dynamic import fails: Loader2 spinner stays visible; check browser console for import error
- If language not highlighting: check `CM_LANG_MAP` in code-editor.tsx for the language name mapping; some languages (graphql, dockerfile, makefile) have no CM equivalent
- If themes look wrong: inspect `darkTheme`/`lightTheme` constants — values are hardcoded oklch, not runtime CSS vars
- Build issues: run `npm run build:web-host` to catch SSR/bundling problems

## Deviations

- **Language name mapping**: The plan assumed `loadLanguage('shell')` for bash/sh/zsh. Investigation revealed the library uses short file-extension names: `loadLanguage('bash')`, `loadLanguage('sh')`. Full names like 'typescript', 'javascript', 'python' return null — only short forms ('ts', 'js', 'py') work. Adjusted CM_LANG_MAP accordingly.
- **mdx**: Mapped to 'markdown' instead of null since CM has no dedicated mdx support but markdown is close enough.
- **ini**: The plan said no CM equivalent, but `loadLanguage('ini')` works. Mapped it.

## Known Issues

None.

## Files Created/Modified

- `web/components/gsd/code-editor.tsx` — New file: CodeEditor component with dynamic import, themes, language mapping, font size
- `web/package.json` — Four new CodeMirror dependencies added
- `.gsd/milestones/M009/slices/S02/S02-PLAN.md` — Added Observability / Diagnostics section (pre-flight fix)
- `.gsd/milestones/M009/slices/S02/tasks/T01-PLAN.md` — Added Observability Impact section (pre-flight fix)
