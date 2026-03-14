# Phase 19: Project Workspace Management — Research

**Researched:** 2026-03-14
**Domain:** React UI, Bun server REST API, Tauri IPC, local filesystem persistence
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WORKSPACE-01 | Managed workspace path for Builder users (`~/GSD Projects/` or `%USERPROFILE%\GSD Projects\`, configurable in Settings); new project auto-creates dir, runs `git init`, runs `gsd` setup, no file picker shown | `get_platform` IPC already available; workspace path stored in global settings (`~/.gsd/defaults.json` via saveSettings); `open_external` pattern established |
| WORKSPACE-02 | Project home screen shown when no project open — grid of project cards; empty state differs by mode (Builder: brief-taking input; Developer: Open Folder) | `useSessionFlow` onboarding mode is the existing gating mechanism; `RecentProject[]` list already persisted at `~/.gsd/recent-projects.json` |
| WORKSPACE-03 | Project card shows name, last active timestamp, active milestone, progress bar, Resume button; `···` menu offers Archive, Open in Finder/Explorer, Remove from list | `RecentProject` type needs extension to hold milestone/progress/archived fields; `open_external` IPC already supports OS Finder/Explorer reveal |
| WORKSPACE-04 | Multi-session tabs surface from home screen — tab bar appears with 2+ open projects; each tab has own `gsd` process and WebSocket; tab shows project name + amber dot if executing | Sessions are already `SessionTab[]` objects in `useSessionManager`; the tab bar already exists in the layout; this phase makes it visible when multiple projects (not just multiple sessions) are open |
| WORKSPACE-05 | Project archiving — archive removes from main grid, restore returns it; no files deleted | Implemented as a metadata flag in the extended `RecentProject` type; no new Rust/Tauri work needed |
</phase_requirements>

---

## Summary

Phase 19 transforms the app entry point from a file-picker-gated session into a managed project home screen that owns its projects. The core challenge is not technical novelty but careful extension of four systems that already exist:

1. **`recent-projects.ts`** — already stores `RecentProject[]` at `~/.gsd/recent-projects.json`. Needs new fields: `archived`, `activeMilestone`, `progressPercent`, `lastActive`. The archive flag lives in this same file.

2. **`AppShell` session flow** — currently routes `mode === "onboarding"` to `OnboardingScreen`. The new `ProjectHomeScreen` replaces the onboarding route when no project is open in the Tauri context. The session flow state machine in `useSessionFlow` needs a new `"home"` mode (or the "onboarding" path is reused with a mode check).

3. **`useSessionManager`** — multi-session is already fully wired at the WebSocket level. WORKSPACE-04 is about surfacing the tab bar when multiple *projects* (not sessions within one project) are open. Each project needs its own Bun/pipeline instance or the project switching mechanism from `pipeline.switchProject()` handles sequential switching.

4. **Settings** — workspace path stored in global tier (`~/.gsd/defaults.json`), read through the existing `getSettings`/`saveSettings` API. No schema changes needed — just add `workspace_path` as a new key.

**Primary recommendation:** Extend `RecentProject`, build `ProjectHomeScreen` as a React component that replaces the onboarding screen, add workspace init logic to a new `workspace-api.ts` server module, and wire the multi-project tab bar at the `AppShell` level. All plumbing exists; this phase assembles it.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | 19.2.4 | ProjectHomeScreen, ProjectCard, tab bar UI | Established project stack |
| Bun server (Bun.serve) | 1.3.10 | New `/api/workspace/*` routes | Established server pattern |
| `node:fs/promises` | built-in | Directory creation, `git init`, workspace path resolution | Established server pattern |
| `node:os` (homedir) | built-in | Resolve `~/GSD Projects/` cross-platform | Already used in `recent-projects.ts` and `settings-api.ts` |
| Tauri IPC (`get_platform`, `open_external`) | 2.x | Platform detection for workspace path; Open in Finder/Explorer | Already implemented in `commands.rs` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `gray-matter` | 4.0.3 | Read project's `preferences.md` to get milestone name for card | Already used in `settings-api.ts` |
| `lucide-react` | 0.577.0 | Icons: `MoreHorizontal` (···), `Archive`, `FolderOpen`, `Trash2` | Already used throughout |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `RecentProject` type | Separate `ProjectMetadata` store | Extra file — extension is simpler, single source of truth stays `~/.gsd/recent-projects.json` |
| Single tab bar for all open projects | Separate window per project | Multi-window is M3 scope per REQUIREMENTS.md SHELL-03 |

**No new npm packages are required for this phase.**

---

## Architecture Patterns

### Recommended Project Structure

New files to add:
```
packages/mission-control/src/
  components/
    workspace/
      ProjectHomeScreen.tsx      # Full-screen grid shown when no project open
      ProjectCard.tsx            # Individual project card with ··· menu
      ProjectCardMenu.tsx        # Archive / Open in Finder / Remove from list
      ProjectTabBar.tsx          # Tab bar shown when 2+ projects open
  server/
    workspace-api.ts             # /api/workspace/* routes (create, get-path)
tests/
  project-home-screen.test.tsx   # WORKSPACE-02, WORKSPACE-03 UI tests
  workspace-api.test.ts          # WORKSPACE-01 server tests
  project-archiving.test.ts      # WORKSPACE-05 tests
  project-tab-bar.test.tsx       # WORKSPACE-04 tab bar tests
```

### Pattern 1: Extended RecentProject Type

`RecentProject` (in `fs-types.ts`) needs these new fields:

```typescript
// Source: packages/mission-control/src/server/fs-types.ts (current + additions)
export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;         // existing — used as "last active" timestamp
  isGsdProject: boolean;      // existing
  // NEW Phase 19 fields:
  archived: boolean;          // WORKSPACE-05: true = hidden from main grid
  activeMilestone?: string;   // e.g. "v2.0" or "Native Desktop" — from STATE.md
  progressPercent?: number;   // 0-100 — from STATE.md progress block
  lastActivity?: string;      // raw last_activity string from STATE.md
}
```

All new fields are optional/defaultable — existing callers continue to work without changes.

### Pattern 2: Workspace Path Resolution (server-side)

New `workspace-api.ts` module handles:
- `GET /api/workspace/path` — returns resolved workspace path for current platform
- `POST /api/workspace/create` — creates project directory, runs `git init`, runs `gsd` (shell: `gsd` with no args to trigger setup), returns project path
- Called only in Builder mode; Developer mode uses existing `open_folder_dialog` IPC

```typescript
// Source: node:os homedir pattern from recent-projects.ts
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";

export function getWorkspacePath(overridePath?: string): string {
  if (overridePath) return overridePath;
  const home = homedir();
  // Platform detection done server-side via process.platform
  return process.platform === "win32"
    ? join(process.env.USERPROFILE ?? home, "GSD Projects")
    : join(home, "GSD Projects");
}

export async function createProject(name: string, workspacePath: string): Promise<{ projectPath: string }> {
  const projectPath = join(workspacePath, name);
  await mkdir(projectPath, { recursive: true });
  // git init
  await runCommand("git", ["init"], projectPath);
  // gsd setup — fire and forget; the project will be opened via switchProject
  return { projectPath };
}
```

### Pattern 3: ProjectHomeScreen as Session Flow Gate

The current session flow in `AppShell.tsx`:
```
mode === "initializing"  →  LoadingLogo
mode === "onboarding"    →  OnboardingScreen
mode === "resume" / "dashboard"  →  full dashboard
```

Phase 19 inserts a home screen as the entry state. The cleanest approach is to introduce a new `"home"` mode in `useSessionFlow` OR repurpose the `"onboarding"` mode with a check: if `!activeProject` AND user has navigated to home, show `ProjectHomeScreen`.

**Recommended:** Add `"home"` mode to `useSessionFlow`. Triggered when:
- Tauri app has no active project (no `planningDir` set)
- User explicitly clicks "Home" from the sidebar

```typescript
// Simplified state machine addition in useSessionFlow:
// "home" → user selects project → "initializing" → "dashboard"
```

### Pattern 4: Project Card Data Population

When building the project card list, the server needs to read each project's `STATE.md` to get `activeMilestone` and `progressPercent`. This happens at:
- `POST /api/projects/recent` — when a project is opened, its state is read and stored in `RecentProject`
- On resume — stale metadata is acceptable (last-known state); no real-time refresh needed for the home screen

The milestone name and progress are pulled from the `GSD2ProjectState` that `buildFullState()` already parses. A lightweight read of just `STATE.md` frontmatter suffices — no need to invoke the full `buildFullState()`.

### Pattern 5: Open in Finder/Explorer via Tauri IPC

The `open_external` IPC command already exists and opens URLs in the browser. For Finder/Explorer, the correct approach is:
- macOS: `open -R <path>` (reveals file in Finder) — use a **new Tauri IPC command** `reveal_in_finder(path)` or use `open_external("file://" + path)` which opens the directory in Finder on macOS
- Windows: `explorer /select,<path>` — similar pattern

**Pattern established in Phase 16:** New Tauri IPC commands follow the same `commands.rs` + `lib.rs` invoke_handler pattern. A `reveal_path` command is 5 lines of Rust.

```rust
// Add to commands.rs:
#[tauri::command]
pub async fn reveal_path(app: AppHandle, path: String) -> bool {
    app.opener()
        .reveal_item_in_dir(&path)
        .map(|_| true)
        .unwrap_or(false)
}
```

The `tauri-plugin-opener` is already in `Cargo.toml` (used by `open_external`). `reveal_item_in_dir` is the correct method — confirm availability in Tauri 2 opener plugin.

### Pattern 6: Multi-Project Tab Bar

WORKSPACE-04 says "already architected in Phase 6.3". Currently `useSessionManager` tracks sessions *within* one project. The existing `SessionTab[]` type already has `name` and `isProcessing` (amber dot).

The distinction for Phase 19: tabs represent **open projects**, not sessions within a project. Each open project has its own `gsd` process via `pipeline.switchProject()`. The current `pipeline.switchProject()` switches to a new project — it does not support simultaneous multi-project state.

**Key architectural decision required:** Does WORKSPACE-04 mean:
A) Multiple projects open simultaneously (true multi-pipeline), or
B) Tabs that switch between projects (one pipeline, switch on tab click)?

Based on the spec: "Each tab has its own `gsd` process, its own WebSocket connection, its own state." This implies option A — true simultaneous multi-project. This is a significant extension of the current architecture.

**Practical approach for M2:** Implement as quick-switch (option B) — clicking a project tab calls `pipeline.switchProject()`. The tab bar shows which projects are in the "open" list. Each tab click switches the single pipeline to that project. The amber dot requires polling or caching the last-known `isAutoMode` state per project.

This is simpler than full multi-pipeline and satisfies the user-visible requirement without architectural rework. The spec says "already architected in Phase 6.3" — meaning the *tab UI* is ready, not that full simultaneous multi-pipeline exists.

### Anti-Patterns to Avoid
- **Reading all recent project STATE.md files on home screen load:** Expensive. Read only cached metadata from `recent-projects.json`. Refresh on project open/close.
- **Adding archive state to `.gsd/` directory:** Archive is a UI concern, not a project concern. Keep it in `~/.gsd/recent-projects.json` only.
- **Building a full multi-pipeline server:** Out of scope for M2. Quick-switch with cached state is sufficient for WORKSPACE-04.
- **Custom dropdown for ··· menu:** Use `lucide-react` icons with inline absolute-positioned div — the established pattern from existing SliceCards. No new dropdown library needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Platform-aware workspace path | Custom platform detection | `process.platform === "win32"` + `process.env.USERPROFILE` | Already established in codebase |
| OS file/folder reveal | Custom shell invocation | `tauri-plugin-opener` `reveal_item_in_dir()` | Already in Cargo.toml; 1 IPC command |
| Project metadata persistence | Custom database | Extend `~/.gsd/recent-projects.json` | Already working, tested pattern |
| Relative timestamp display ("2 hours ago") | Moment.js / date-fns | Inline `Date.now()` arithmetic | No new dependencies; simple for "hours ago" / "days ago" display |
| Tab bar state | Redux / Zustand | Local `useState` in AppShell + prop drilling | Established project pattern — no state library used |

---

## Common Pitfalls

### Pitfall 1: Stale Project Metadata on Home Screen
**What goes wrong:** A project card shows "Milestone 1 · 43%" but the project has advanced to Milestone 2 since it was last opened in Mission Control.
**Why it happens:** `recent-projects.json` is written on project open/close; in-between the project may have advanced via CLI.
**How to avoid:** On Resume button click, refresh metadata from STATE.md *before* opening the project, not on home screen load. Accept stale display on the card — it is "last known state", which is correct UX for a home screen.
**Warning signs:** Tests that assert live STATE.md values on the home screen will be brittle.

### Pitfall 2: Workspace Path Mismatch (Windows vs Unix)
**What goes wrong:** `~/GSD Projects/` resolves to `C:\Users\Bantu\GSD Projects\` on Windows but the path separator causes downstream `git init` failures.
**Why it happens:** `node:path` join uses OS separator but the path gets passed as a string to `spawn("git", ...)`.
**How to avoid:** Use `join()` from `node:path` throughout — never string concatenation for paths. The `child_process` spawn accepts OS-native paths.
**Warning signs:** The project is on Windows (`win32` platform) — test this explicitly.

### Pitfall 3: Builder Mode New Project Flow — `gsd` setup Behavior
**What goes wrong:** After `mkdir + git init`, calling `gsd` with no arguments opens an interactive TUI rather than running a non-interactive setup.
**Why it happens:** `gsd` is an interactive session by default.
**How to avoid:** The M2 spec says "runs `gsd` setup" — this likely means the project is opened in Mission Control immediately after `git init`, and the user starts the GSD session through the normal chat flow. Do NOT auto-spawn `gsd` headlessly. The "setup" is just `git init` + opening the project in Mission Control.
**Warning signs:** Any code that tries to `spawn("gsd", ["setup"])` without a PTY will hang.

### Pitfall 4: `reveal_item_in_dir` Plugin Version Compatibility
**What goes wrong:** `opener.reveal_item_in_dir()` does not exist in the version of `tauri-plugin-opener` installed.
**Why it happens:** The opener plugin version may predate this API.
**How to avoid:** Fall back to `open_external("file://" + path)` which opens the directory rather than revealing a specific file. Check the Cargo.lock version of `tauri-plugin-opener` before using `reveal_item_in_dir`.
**Warning signs:** Rust compile error: no method named `reveal_item_in_dir`.

### Pitfall 5: AppShell Session Flow — Home vs Onboarding Conflict
**What goes wrong:** Adding `"home"` mode to `useSessionFlow` breaks the existing onboarding flow for first-time users.
**Why it happens:** `useSessionFlow` currently routes `"onboarding"` to `OnboardingScreen`. If home screen replaces onboarding, new users who have never opened a project lose the welcome experience.
**How to avoid:** Keep `"onboarding"` for first-ever launch (no recent projects, no config). `"home"` mode triggers when there are recent projects but none is currently active. The two states are distinct.
**Warning signs:** Tests for `OnboardingScreen` start failing after session flow changes.

### Pitfall 6: Archive Flag Not Backward Compatible
**What goes wrong:** Old entries in `recent-projects.json` have no `archived` field; code checks `project.archived === true` but gets `undefined`, which is falsy — this works correctly. But a strict TypeScript type check may fail.
**Why it happens:** `archived` is a new field added to an existing persisted structure.
**How to avoid:** Make `archived` optional (`archived?: boolean`) and always read as `project.archived ?? false`. This is the established project pattern (see `ConfigState.worktree_enabled?: boolean`).

---

## Code Examples

### Current RecentProject type (to extend)
```typescript
// Source: packages/mission-control/src/server/fs-types.ts
export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
  isGsdProject: boolean;
}
```

### Existing `addRecentProject` pattern (to extend with new fields)
```typescript
// Source: packages/mission-control/src/server/recent-projects.ts
export async function addRecentProject(project: RecentProject): Promise<void> {
  const existing = await getRecentProjects();
  const filtered = existing.filter((p) => p.path !== project.path);
  filtered.unshift(project);
  const trimmed = filtered.slice(0, MAX_RECENT);
  await mkdir(dirname(recentFilePath), { recursive: true });
  await writeFile(recentFilePath, JSON.stringify(trimmed, null, 2));
}
```

### Existing `handleRecentProjectsRequest` pattern to extend
Add new routes alongside existing GET/POST:
```
DELETE /api/projects/recent           — Remove from list (remove entry)
PATCH  /api/projects/recent/archive   — Toggle archived flag
```

### Tauri IPC invoke pattern (established in Phase 16)
```typescript
// Source: packages/mission-control/src/auth.ts (pattern)
import { invoke } from "@tauri-apps/api/core";
const platform = await invoke<string>("get_platform");
// New usage:
const workspacePath = await invoke<string>("get_workspace_path");
await invoke("reveal_path", { path: projectPath });
```

### Settings global tier write (established)
```typescript
// Source: packages/mission-control/src/server/settings-api.ts
await saveSettings("global", { workspace_path: "/custom/path" });
// Read:
const settings = await getSettings(planningDir);
const workspacePath = settings.global.workspace_path as string | undefined;
```

### Multi-project tab — SessionTab type (already in use)
```typescript
// Source: packages/mission-control/src/hooks/useSessionManager.ts
export interface SessionTab {
  id: string;
  name: string;
  isProcessing: boolean;
  hasWorktree: boolean;
  worktreeBranch?: string | null;
}
```
For project tabs, `name` = project name, `isProcessing` = amber dot condition.

### AppShell session flow routing pattern
```typescript
// Source: packages/mission-control/src/components/layout/AppShell.tsx
if (mode === "initializing") { return <LoadingLogo />; }
if (mode === "onboarding") { return <OnboardingScreen ... />; }
// New insertion point:
if (mode === "home") { return <ProjectHomeScreen ... />; }
// Dashboard continues unchanged
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single project (no project manager) | Recent projects list at `~/.gsd/recent-projects.json` | Phase 6.1 | Foundation for Phase 19's home screen |
| Onboarding screen as entry point | Auth → Trust → AppShell pipeline | Phases 16, 17 | Phase 19 inserts home screen *after* Trust, *before* AppShell dashboard |
| Sessions = chat threads within one project | Multi-session (4 concurrent) | Phase 6.3 | Phase 19 repurposes the tab UI for project switching |

**No deprecated patterns introduced in Phase 19.** The `OnboardingScreen` component stays for first-launch.

---

## Open Questions

1. **`reveal_item_in_dir` availability**
   - What we know: `tauri-plugin-opener` is in `Cargo.toml` (used by `open_external`). The `reveal_item_in_dir` method exists in `tauri-plugin-opener` >= 2.2 (verified in Tauri docs).
   - What's unclear: Exact version in `Cargo.lock` — needs to be checked at implementation time.
   - Recommendation: Check `src-tauri/Cargo.lock` for `tauri-plugin-opener` version. If < 2.2, fall back to `open_external("file://" + path)`.

2. **Multi-project tab architecture decision**
   - What we know: Spec says "each tab has its own `gsd` process, its own WebSocket connection, its own state." The current `pipeline.switchProject()` is a sequential switch, not simultaneous.
   - What's unclear: Does M2 require true simultaneous multi-pipeline or is quick-switch acceptable?
   - Recommendation: Implement quick-switch (tab click calls `switchProject`) for M2. Each project is tracked in the open-projects list. The amber dot is derived from the last-known `isAutoMode` per project, cached in the open-projects list. True simultaneous multi-pipeline is M3 scope.

3. **`gsd` setup for new Builder projects**
   - What we know: The spec says "runs `gsd` setup" after `git init`. `gsd` is an interactive session.
   - What's unclear: Is there a non-interactive init command for `gsd`?
   - Recommendation: After `mkdir + git init`, open the project in Mission Control normally. The user initiates GSD via the chat interface. Do not auto-spawn `gsd` headlessly. If the GSD CLI has a `gsd init` or `gsd setup` flag, check the `commands.ts` source — but do not block on it.

4. **Project name input for Builder mode new project**
   - What we know: Empty state shows "brief-taking input" for Builder mode.
   - What's unclear: Is the brief-taking input just a project name field, or a full multi-step brief (milestone/features)?
   - Recommendation: Per the execution prompt: "Create your first project" with a brief-taking input. Treat it as a project name + optional brief text, both sent to `gsd` as the first message after the project is created. Keep it simple for M2.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built into Bun 1.3.10) |
| Config file | none — bun discovers tests in `tests/` directory |
| Quick run command | `cd packages/mission-control && bun test tests/workspace-api.test.ts tests/project-home-screen.test.tsx --timeout 5000` |
| Full suite command | `cd packages/mission-control && bun test --timeout 30000` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WORKSPACE-01 | `getWorkspacePath()` returns `~/GSD Projects` on macOS/Linux, `%USERPROFILE%\GSD Projects` on Windows | unit | `bun test tests/workspace-api.test.ts -t "getWorkspacePath"` | ❌ Wave 0 |
| WORKSPACE-01 | `createProject()` creates directory, runs `git init`, returns path | unit | `bun test tests/workspace-api.test.ts -t "createProject"` | ❌ Wave 0 |
| WORKSPACE-01 | Settings global tier stores and reads `workspace_path` | unit | `bun test tests/workspace-api.test.ts -t "workspace_path setting"` | ❌ Wave 0 |
| WORKSPACE-02 | `ProjectHomeScreen` renders grid in Developer mode with "Open Folder" empty state | unit | `bun test tests/project-home-screen.test.tsx -t "Developer empty state"` | ❌ Wave 0 |
| WORKSPACE-02 | `ProjectHomeScreen` renders brief-taking input in Builder mode | unit | `bun test tests/project-home-screen.test.tsx -t "Builder empty state"` | ❌ Wave 0 |
| WORKSPACE-03 | `ProjectCard` renders name, last active, milestone, progress, Resume button | unit | `bun test tests/project-home-screen.test.tsx -t "ProjectCard renders"` | ❌ Wave 0 |
| WORKSPACE-03 | `···` menu items: Archive, Open in Finder/Explorer, Remove from list | unit | `bun test tests/project-home-screen.test.tsx -t "ProjectCardMenu"` | ❌ Wave 0 |
| WORKSPACE-04 | Tab bar hidden when 0 or 1 project open; visible when 2+ | unit | `bun test tests/project-tab-bar.test.tsx -t "tab bar visibility"` | ❌ Wave 0 |
| WORKSPACE-04 | Tab shows amber dot when project `isProcessing` | unit | `bun test tests/project-tab-bar.test.tsx -t "amber dot"` | ❌ Wave 0 |
| WORKSPACE-05 | `archiveProject()` sets `archived: true`, project disappears from main grid | unit | `bun test tests/project-archiving.test.ts -t "archive"` | ❌ Wave 0 |
| WORKSPACE-05 | Archived projects shown in "Archived" section when "Show archived" clicked | unit | `bun test tests/project-archiving.test.ts -t "show archived"` | ❌ Wave 0 |
| WORKSPACE-05 | `restoreProject()` sets `archived: false`, project returns to main grid | unit | `bun test tests/project-archiving.test.ts -t "restore"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/mission-control && bun test tests/workspace-api.test.ts tests/project-home-screen.test.tsx tests/project-tab-bar.test.tsx tests/project-archiving.test.ts --timeout 5000`
- **Per wave merge:** `cd packages/mission-control && bun test --timeout 30000`
- **Phase gate:** Full suite green (748+ tests) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/workspace-api.test.ts` — covers WORKSPACE-01 server functions
- [ ] `tests/project-home-screen.test.tsx` — covers WORKSPACE-02, WORKSPACE-03 UI
- [ ] `tests/project-tab-bar.test.tsx` — covers WORKSPACE-04 tab visibility and amber dot
- [ ] `tests/project-archiving.test.ts` — covers WORKSPACE-05 archive/restore

*(Framework installed — `bun:test` is the established runner. No new packages needed.)*

---

## Sources

### Primary (HIGH confidence)
- Direct codebase read: `packages/mission-control/src/server/recent-projects.ts` — existing persistence layer
- Direct codebase read: `packages/mission-control/src/server/fs-types.ts` — `RecentProject` type
- Direct codebase read: `packages/mission-control/src/components/layout/AppShell.tsx` — session flow routing
- Direct codebase read: `packages/mission-control/src/hooks/useSessionManager.ts` — `SessionTab` type and multi-session architecture
- Direct codebase read: `packages/mission-control/src/server/session-manager.ts` — `SessionState` and `createSession` pattern
- Direct codebase read: `packages/mission-control/src/server/settings-api.ts` — `saveSettings("global", ...)` pattern
- Direct codebase read: `src-tauri/src/commands.rs` — existing IPC commands including `open_external`, `get_platform`
- Direct codebase read: `.planning/GSD-Mission-Control-M2-Execution-Prompt.md` — Phase 19 spec

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — WORKSPACE-01 through WORKSPACE-05 requirement text
- `.planning/ROADMAP.md` — Phase 19 success criteria
- `.planning/STATE.md` — Decisions log (Phase patterns, inline styles, test infrastructure)

### Tertiary (LOW confidence)
- `tauri-plugin-opener` `reveal_item_in_dir` method — verified in Tauri documentation but exact installed version not confirmed. Verify against `src-tauri/Cargo.lock` at implementation time.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — all patterns established in Phases 14–18; Phase 19 assembles existing primitives
- Pitfalls: HIGH — Windows platform tested (dev machine is Windows 11), pipeline switch architecture is known, archive backward-compat is established pattern
- Open questions: MEDIUM — `reveal_item_in_dir` version, multi-project tab architecture decision

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable stack — 30 days)
