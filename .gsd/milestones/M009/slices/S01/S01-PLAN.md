# S01: File Write API & Editor Font Size

**Goal:** POST /api/files saves file content to disk with path validation; editor font size is configurable in settings and persists in localStorage.
**Demo:** `curl -X POST .../api/files` writes a file and returns 200; path traversal returns 400. Settings panel shows "Editor Text Size" with preset buttons; changing size persists across page refresh.

## Must-Haves

- POST handler on `/api/files` accepts `{ path, content, root }` JSON body
- Reuses existing `resolveSecurePath()` — rejects `..`, absolute paths, paths escaping root
- Returns 400 for invalid paths/traversal, 404 for missing parent dir, 413 for oversized content
- Allows empty string content (clearing a file is valid)
- `useEditorFontSize()` hook with localStorage key `gsd-editor-font-size`, default 14, range 8–24
- `EditorSizePanel` in settings with preset buttons [11–16], live preview, wired into command-surface
- `npm run build:web-host` exits 0

## Proof Level

- This slice proves: contract
- Real runtime required: yes (curl verification of POST handler)
- Human/UAT required: no

## Verification

- `curl -X POST http://localhost:3000/api/files?project=... -H 'Content-Type: application/json' -d '{"path":"test-write.txt","content":"hello","root":"project"}'` → 200 with `{ success: true }`
- `curl -X POST ... -d '{"path":"../../../etc/passwd","content":"x","root":"gsd"}'` → 400
- `curl -X POST ... -d '{"path":"nonexistent/deep/file.txt","content":"x","root":"project"}'` → 404
- `curl -X POST ... -d '{"content":"x","root":"gsd"}'` with missing `path` field → 400 with structured `{ error: "..." }` JSON (failure-path diagnostic check)
- `npm run build:web-host` exits 0

## Observability / Diagnostics

- POST `/api/files` returns structured JSON errors with appropriate HTTP status codes (400, 404, 413) — inspectable via `curl -v` or browser network tab.
- Successful writes return `{ success: true }` — agent or UI can confirm write completed.
- Path validation failures include descriptive error messages matching the GET handler's style — agents can programmatically distinguish traversal rejections from missing-parent errors.
- Editor font size persisted in `localStorage` key `gsd-editor-font-size` — inspectable via browser devtools `localStorage.getItem("gsd-editor-font-size")`.

## Integration Closure

- Upstream surfaces consumed: `resolveSecurePath()`, `getRootForMode()`, `resolveProjectCwd()` from `web/app/api/files/route.ts`; `useTerminalFontSize` pattern from `web/lib/use-terminal-font-size.ts`; `TerminalSizePanel` pattern from `settings-panels.tsx`
- New wiring introduced in this slice: POST handler in `/api/files/route.ts`, `EditorSizePanel` component in command-surface settings section
- What remains before the milestone is truly usable end-to-end: S02 (CodeMirror editor consuming POST + font size hook), S03 (markdown edit), S04 (polish)

## Tasks

- [x] **T01: Add POST handler to /api/files with path validation and write security** `est:30m`
  - Why: S02's Save button depends on this endpoint. It's the security-critical piece — path traversal must be rejected using the same `resolveSecurePath()` the GET handler uses.
  - Files: `web/app/api/files/route.ts`
  - Do: Add `writeFileSync` and `dirname` to the `node:fs` / `node:path` imports. Add a `POST` export function that: parses JSON body (`await request.json()`), validates `root` is "gsd" or "project", validates `content` is a string, checks `Buffer.byteLength(content) <= MAX_FILE_SIZE` (413 if exceeded), resolves the path with `resolveSecurePath()` (400 if null), checks parent directory exists with `existsSync(dirname(resolved))` (404 if missing), writes with `writeFileSync(resolved, content, "utf-8")`, returns `{ success: true }`. Wrap the whole body parse in try/catch for malformed JSON (400). Allow `content === ""`.
  - Verify: `npm run build:web-host` exits 0. Start server, curl valid write → 200, curl traversal → 400, curl missing parent → 404, curl oversized body → 413.
  - Done when: POST /api/files correctly writes valid files and rejects all traversal/invalid paths with appropriate status codes.

- [ ] **T02: Add useEditorFontSize hook, EditorSizePanel, and wire into settings** `est:30m`
  - Why: R121 requires a configurable font size for the file viewer/editor. This follows the exact pattern already proven by `useTerminalFontSize` + `TerminalSizePanel`.
  - Files: `web/lib/use-editor-font-size.ts`, `web/components/gsd/settings-panels.tsx`, `web/components/gsd/command-surface.tsx`
  - Do: (1) Create `web/lib/use-editor-font-size.ts` cloning `use-terminal-font-size.ts` with: storage key `gsd-editor-font-size`, default 14, event name `editor-font-size-changed`, same 8–24 range. (2) In `settings-panels.tsx`: add `EDITOR_SIZE_PRESETS = [11, 12, 13, 14, 15, 16]` constant, add `EditorSizePanel` component after `TerminalSizePanel` using same structure — `SettingsHeader` with `Type` icon, subtitle "Applies to file viewer & editor", preset buttons with 14 as default marker, live preview div with `font-mono`. Export the component. (3) In `command-surface.tsx`: add `EditorSizePanel` to the import from `./settings-panels`, add `<EditorSizePanel />` after `<TerminalSizePanel />` in the `gsd-prefs` case.
  - Verify: `npm run build:web-host` exits 0. Start server, open settings → "Editor Text Size" panel visible with preset buttons → clicking a preset updates the preview text → refreshing page preserves the selection.
  - Done when: Editor font size preference persists in localStorage and the settings panel renders with working preset buttons and live preview.

## Files Likely Touched

- `web/app/api/files/route.ts`
- `web/lib/use-editor-font-size.ts`
- `web/components/gsd/settings-panels.tsx`
- `web/components/gsd/command-surface.tsx`
