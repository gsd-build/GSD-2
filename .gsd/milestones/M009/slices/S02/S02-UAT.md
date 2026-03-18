# S02: CodeMirror Integration & Code Editing — UAT

**Milestone:** M009
**Written:** 2026-03-18

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: This slice delivers interactive browser UI (CodeMirror editor, View/Edit tabs, save flow) that requires a running dev server to exercise. Artifact inspection alone cannot verify dynamic import loading, theme rendering, or save round-trips.

## Preconditions

1. `npm run build:web-host` exits 0 from the M009 worktree
2. `npm run gsd:web:stop:all` to clear old instances
3. `npm run gsd:web` to start the production web host
4. Open browser to the displayed localhost URL
5. Complete onboarding if prompted (provider + auth)
6. Navigate to the **Files** view in the sidebar

## Smoke Test

Open any `.ts` file in the Files view → verify "View" and "Edit" tabs appear above the file content.

## Test Cases

### 1. View/Edit tabs appear for code files

1. In the Files sidebar, click the **GSD** root tab
2. Navigate to and click any `.ts` or `.tsx` file (e.g. `STATE.md` won't work — pick a code file from the **Project** tab)
3. **Expected:** Two tabs labeled "View" and "Edit" appear at the top of the file content area. A "Save" button appears right-aligned in the tab bar. View tab is active by default showing shiki-highlighted code.

### 2. Edit tab loads CodeMirror editor

1. With a code file open, click the **Edit** tab
2. **Expected:** CodeMirror editor loads (may show a brief spinner). The editor shows the file content with monochrome syntax highlighting, line numbers, and a gutter. The background matches the current theme (dark: near-black; light: near-white).

### 3. Dirty state and Save button activation

1. In the Edit tab, type any character into the editor
2. **Expected:** The Save button becomes enabled (no longer grayed out / disabled)
3. Press Ctrl+Z (or Cmd+Z) to undo the change
4. **Expected:** Save button becomes disabled again (content matches original)

### 4. Save writes file and updates View tab

1. In the Edit tab, add a comment line (e.g. `// test comment`) at the end of the file
2. Click the **Save** button
3. **Expected:** Save button shows a brief loading state, then returns to disabled. No error text appears.
4. Click the **View** tab
5. **Expected:** The View tab shows the updated content including the added comment, re-highlighted by shiki.
6. Clean up: go back to Edit, remove the comment, Save again.

### 5. Save error display

1. Open browser DevTools Network tab
2. In the Edit tab, modify content and note the Save button is enabled
3. Use DevTools to block `/api/files` requests (or throttle to offline)
4. Click Save
5. **Expected:** A red error message appears inline near the Save button (class `text-destructive`). Save button re-enables so user can retry.

### 6. Read-only mode when props are absent

1. Verify that any component consuming `FileContentViewer` without `root`/`path`/`onSave` props renders the file in read-only mode with no tabs
2. **Expected:** The file content renders identically to the pre-S02 behavior — just the content, no View/Edit tabs, no Save button.

### 7. Editor font size setting

1. Open command surface (Cmd+K or equivalent)
2. Type `/gsd prefs` to open settings
3. Scroll to "Editor Text Size" section
4. Click the **16px** button
5. **Expected:** The preview text below the buttons changes to 16px. The label "(default)" appears next to 14px, not 16px.
6. Go back to Files view, open a file, click Edit tab
7. **Expected:** The CodeMirror editor renders at 16px font size.
8. Clean up: return to settings, click 14px to restore default.

### 8. Dark/Light theme switching

1. Open a code file and click Edit tab — verify CodeMirror has dark background (oklch ~0.09)
2. Switch to light theme (via settings or system preference)
3. **Expected:** CodeMirror editor switches to light background (oklch ~0.98) with dark foreground text. Gutter colors adjust accordingly.
4. Switch back to dark theme.

## Edge Cases

### Large file handling

1. Open a large file (e.g. a `package-lock.json` or any file >100KB that's under the 256KB view limit)
2. Click Edit tab
3. **Expected:** CodeMirror loads and renders the file. May take a moment but should not crash or show an error. Scrolling works.

### Unsupported language

1. Open a file with no recognized extension (e.g. a `LICENSE` file or a `.gitignore`)
2. Click Edit tab
3. **Expected:** CodeMirror renders as plain text — no syntax highlighting, but editor still functional (line numbers, editing works).

### Tab persistence across file selection

1. Open file A, click Edit tab, type something (dirty state)
2. Click file B in the sidebar
3. **Expected:** File B opens in View tab. Going back to file A shows fresh content (dirty edits are lost — by design, no unsaved-changes warning in S02).

## Failure Signals

- **No View/Edit tabs visible:** Check that `root`, `path`, `onSave` props are being passed from `files-view.tsx` → verify `FileContentViewer` receives them.
- **Spinner stays forever in Edit tab:** CodeMirror dynamic import failed. Check browser console for import errors. Run `npm run build:web-host` to verify bundling.
- **Save button never activates:** Dirty state detection broken. Check that `editContent` state updates on CodeMirror onChange.
- **Save silently fails:** Check browser Network tab for POST `/api/files` response. Look for `{ error: ... }` in response body.
- **No EditorSizePanel in settings:** Check that `EditorSizePanel` is imported and rendered in `command-surface.tsx` under `gsd-prefs`.
- **Build fails:** Run `npm run build:web-host` and check for module-not-found errors related to CodeMirror packages.

## Requirements Proved By This UAT

- R122 — CodeMirror 6 editor with custom theme in Edit tab (test cases 2, 8)
- R124 — POST /api/files writes and returns structured errors (test cases 4, 5)
- R121 — Editor font size configurable and persistent (test case 7)

## Not Proven By This UAT

- R123 — Markdown-specific View/Edit split (deferred to S03)
- Visual pixel-perfect theme comparison between shiki and CodeMirror (deferred to S04)
- Path traversal security testing of POST /api/files (structural verification only — no penetration testing in UAT)

## Notes for Tester

- The `@gsd/native` build warning is expected and harmless — it's an optional native module.
- Pre-existing tsc errors in `gsd-workspace-store.tsx` and `pty-manager.ts` are unrelated to S02.
- The dev server must be started with `npm run gsd:web` (production mode), not `npm run dev`, for the file write API to work correctly with project context headers.
- After testing save, verify the file on disk actually changed: `cat <filepath>` from the terminal.
