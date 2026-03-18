# S01 (File Write API & Editor Font Size) — Research

**Date:** 2026-03-18
**Depth:** Light — straightforward application of known patterns already in the codebase.

## Summary

This slice adds two independent capabilities: (1) a POST handler on the existing `/api/files` route for writing file content to disk with path validation, and (2) an editor font size preference hook + settings panel following the established `useTerminalFontSize` pattern.

Both are mechanically straightforward. The POST handler reuses `resolveSecurePath()` already defined in `web/app/api/files/route.ts`. The font size hook is a near-copy of `web/lib/use-terminal-font-size.ts` with different storage key, default value (14 vs 13), and event name. The settings panel follows `TerminalSizePanel` in `settings-panels.tsx` exactly.

No new libraries, no risky integration, no ambiguous scope.

## Recommendation

Build the POST handler first — it's the critical path (S02 depends on it for Save). Then build the font size hook and settings panel. Both are independent and can be verified independently.

## Implementation Landscape

### Key Files

- **`web/app/api/files/route.ts`** — Currently GET-only. Add a `POST` handler that accepts `{ path, content, root }` JSON body. Reuse `resolveSecurePath()` and `getRootForMode()` already defined in this file. Use `writeFileSync` from `node:fs`. Return `{ success: true }` on success, `{ error }` with 400/404/413 status on failure. Import `writeFileSync` at the top (already imports `existsSync, readdirSync, readFileSync, statSync`). Keep `MAX_FILE_SIZE` (256KB) as the write limit too — reject oversized writes with 413.

- **`web/lib/use-editor-font-size.ts`** — New file. Clone `use-terminal-font-size.ts` pattern: localStorage key `gsd-editor-font-size`, custom event `editor-font-size-changed`, default 14, range 8–24. Export `useEditorFontSize()` returning `[number, (size: number) => void]`.

- **`web/components/gsd/settings-panels.tsx`** — Add `EditorSizePanel` component after `TerminalSizePanel` (line ~900). Same structure: `SettingsHeader` with `Type` icon, subtitle "Applies to file viewer & editor", preset buttons `[11, 12, 13, 14, 15, 16]` with 14 as default, live preview div with `font-mono`. Import `useEditorFontSize` from `@/lib/use-editor-font-size`. Export the component.

- **`web/components/gsd/command-surface.tsx`** — Two changes:
  1. Add `EditorSizePanel` to the import from `./settings-panels` (line 62).
  2. Add `<EditorSizePanel />` after `<TerminalSizePanel />` in the `gsd-prefs` case (line ~2036).

### Build Order

1. **POST handler** — The security-critical piece; S02's Save button depends on it. Verify with curl: valid write returns 200, path traversal returns 400, missing parent dir returns 404, oversized body returns 413.
2. **`useEditorFontSize` hook** — Independent of POST. Mechanical clone of terminal hook.
3. **`EditorSizePanel` + command-surface wiring** — Consumes the hook. Verify in browser settings panel.

### Verification Approach

- **POST security:** `curl -X POST http://localhost:3000/api/files -H 'Content-Type: application/json' -d '{"path":"test.txt","content":"hello","root":"project"}'` → 200; `curl ... -d '{"path":"../../../etc/passwd","content":"x","root":"gsd"}'` → 400; `curl ... -d '{"path":"nonexistent/deep/file.txt","content":"x","root":"project"}'` — verify parent dir handling.
- **Build:** `npm run build:web-host` exits 0.
- **Font size:** Open settings panel in browser → Editor Size section visible → click preset → preview text updates → refresh page → preference persists.

## Constraints

- `resolveSecurePath()` is a module-private function in `route.ts` — it's already in scope for the POST handler since both handlers are in the same file. No need to extract or export it.
- `resolveProjectCwd(request)` reads `?project=` query param or falls back to env. For POST, the project identifier should be in the JSON body or query string. Since GET uses query params, POST should also accept `root` from the body but project from query string (consistent with `resolveProjectCwd` which reads from URL). Actually, looking at the code, `resolveProjectCwd` reads from `request.url` which works for both GET and POST — the `?project=` query param can be on a POST URL.
- The existing `MAX_FILE_SIZE` (256KB) should apply to writes too — prevents accidentally writing huge files via the API.
- Parent directory creation: `writeFileSync` will throw if the parent directory doesn't exist. The handler should NOT create parent directories — only write to existing paths. Return 404 if parent dir doesn't exist. This is safer than auto-creating directories via a web API.

## Common Pitfalls

- **POST body parsing in Next.js App Router** — Use `await request.json()` not `request.body`. The App Router `Request` object is a standard Web API Request; `.json()` returns the parsed body.
- **Content-Type validation** — Should check that the request has a JSON body. `request.json()` will throw on non-JSON; catch and return 400.
- **Empty content writes** — Allow writing empty string (valid use case: clearing a file). Don't reject `content === ""`.
- **Binary file writes** — The API accepts string content only (JSON). This is fine — the editor only edits text files. No need to handle binary.
