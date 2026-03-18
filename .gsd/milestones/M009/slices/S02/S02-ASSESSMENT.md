# S02 Roadmap Assessment

## Verdict: Minor roadmap update — S03 merged into S02

S02's implementation already built all three S03 deliverables:

1. **Markdown View tab** — `ReadOnlyContent` branches on `isMarkdown(filepath)`, rendering `MarkdownViewer` (react-markdown) for .md files and `CodeViewer` (shiki) for everything else.
2. **Markdown Edit tab** — `CodeEditor` receives the detected language from `detectLanguage(filepath)`, which returns `"markdown"` for .md/.mdx files. `CM_LANG_MAP` maps `"markdown"` to the CodeMirror markdown extension via `@uiw/codemirror-extensions-langs`.
3. **Content refresh on save** — `handleSave` in `files-view.tsx` POSTs to `/api/files` then calls `handleSelectFile(selectedPath)` to re-fetch. The updated `content` prop flows to `FileContentViewer`, resetting `editContent` via `useEffect([content])`.

S03 has zero remaining deliverables. Removed as a standalone slice and marked merged.

## Roadmap Changes

- **S03** marked `[x]` with note "merged into S02" — all deliverables already built
- **S04** dependency updated from `[S01,S02,S03]` to `[S01,S02]`; scope expanded to include markdown View/Edit round-trip verification and shiki View tab font size application
- **Milestone Definition of Done** updated from 4 slice deliverables to 3

## Success-Criterion Coverage

All criteria map to S04 as the sole remaining slice:

- Any file opened in the file viewer shows View and Edit tabs → **S04** (browser verify)
- View tab renders identically to current file viewer → **S04** (visual verify)
- Edit tab uses CodeMirror 6 with syntax highlighting → **S04** (visual verify)
- Save button writes file content to disk via POST /api/files → **S04** (end-to-end test)
- After saving, View tab reflects updated content → **S04** (end-to-end test)
- Editor font size configurable and persists → **S04** (browser verify; shiki View tab font size wiring needed)
- `npm run build:web-host` exits 0 → **S04** (build check)

No criterion lost its owner. Coverage passes.

## Requirement Coverage

- **R121** (editor font size): Active. Hook and settings panel built. CodeMirror Edit tab consumes it. Shiki View tab font size application still needed — S04 scope.
- **R122** (CodeMirror editor): Validated by S02. No change.
- **R123** (markdown view/edit split): Now covered by S02 implementation. S04 verifies in browser.
- **R124** (POST /api/files): Validated by S02. No change.

Requirement coverage remains sound. No new risks surfaced.

## Risks

All three key risks retired:
- ✅ Bundle size — dynamic import via `next/dynamic` ssr:false
- ✅ Theme mapping — oklch tokens mapped to `createTheme` settings/styles
- ✅ Write security — `resolveSecurePath()` reused from GET handler
