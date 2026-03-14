---
phase: 19-project-workspace
plan: 02
subsystem: api
tags: [workspace, recent-projects, archive, tauri, rust, bun, typescript]

requires:
  - phase: 19-01
    provides: RED test stubs for workspace-api and project-archiving

provides:
  - workspace-api.ts with getWorkspacePath, createProject, handleWorkspaceRequest
  - Extended RecentProject type with archived, activeMilestone, progressPercent, lastActivity
  - archiveProject, restoreProject, getArchivedProjects in recent-projects.ts
  - PATCH /api/projects/recent/archive and DELETE /api/projects/recent REST routes
  - reveal_path Tauri IPC command registered in invoke_handler
  - handleWorkspaceRequest wired in server.ts /api/workspace/*

affects: [19-03, 19-04, 19-05, 20]

tech-stack:
  added: []
  patterns:
    - "_setWorkspaceFilePath test helper mirrors _setRecentFilePath pattern for test isolation"
    - "archive operations as set archived:true / archived:false in-place — no separate store"

key-files:
  created:
    - packages/mission-control/src/server/workspace-api.ts
  modified:
    - packages/mission-control/src/server/fs-types.ts
    - packages/mission-control/src/server/recent-projects.ts
    - packages/mission-control/src/server/server.ts
    - src-tauri/src/commands.rs
    - src-tauri/src/lib.rs

key-decisions:
  - "_setWorkspaceFilePath (not _setWorkspacePathOverride) is the exported test helper name — matching what the RED test stub imports"
  - "reveal_path uses reveal_item_in_dir (available in tauri-plugin-opener 2.5.3) with open_url fallback for older versions"
  - "workspace route dispatched via /api/workspace/* prefix check in server.ts — consistent with all other route blocks"

patterns-established:
  - "Test helper naming: _set{Resource}FilePath for file-backed singletons"

requirements-completed: [WORKSPACE-01, WORKSPACE-03, WORKSPACE-05]

duration: 5min
completed: 2026-03-14
---

# Phase 19 Plan 02: Server-Side Workspace API and Archive Operations Summary

**workspace-api.ts (getWorkspacePath/createProject/REST routes), extended RecentProject with archive fields, reveal_path Rust IPC command, and 7 tests GREEN**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-14T15:03:42Z
- **Completed:** 2026-03-14T15:09:00Z
- **Tasks:** 3
- **Files modified:** 5 (created 1)

## Accomplishments
- Extended RecentProject interface with 4 optional fields (archived, activeMilestone, progressPercent, lastActivity) maintaining backward compatibility
- Implemented archiveProject, restoreProject, getArchivedProjects + PATCH and DELETE REST routes in recent-projects.ts — project-archiving.test.ts 3/3 GREEN
- Created workspace-api.ts with getWorkspacePath (platform-aware), createProject (mkdir + git init), handleWorkspaceRequest (3 routes) — workspace-api.test.ts 4/4 GREEN
- Added reveal_path Tauri command using tauri-plugin-opener 2.5.3 reveal_item_in_dir with open_url fallback; registered in invoke_handler; cargo check passes
- Wired handleWorkspaceRequest into server.ts at /api/workspace/* route block
- Full TS suite: 756 pass, 0 new failures (2 pre-existing RED stubs from 19-01 for UI components not yet built)

## Task Commits

1. **Task 1: Extend RecentProject type + archive operations** - `efd4d30` (feat)
2. **Task 2: Create workspace-api.ts** - `f01bae2` (feat)
3. **Task 3: reveal_path Tauri IPC + workspace route registration** - `999bfa9` (feat)

## Files Created/Modified
- `packages/mission-control/src/server/fs-types.ts` - Added 4 optional fields to RecentProject
- `packages/mission-control/src/server/recent-projects.ts` - archiveProject/restoreProject/getArchivedProjects + 2 REST routes
- `packages/mission-control/src/server/workspace-api.ts` - NEW: getWorkspacePath, createProject, handleWorkspaceRequest, _setWorkspaceFilePath
- `packages/mission-control/src/server/server.ts` - Import and route block for handleWorkspaceRequest
- `src-tauri/src/commands.rs` - reveal_path command with reveal_item_in_dir + fallback
- `src-tauri/src/lib.rs` - commands::reveal_path added to invoke_handler list

## Decisions Made
- `_setWorkspaceFilePath` is the exported test helper name (not `_setWorkspacePathOverride` as the plan draft suggested) — the RED test stub already used this name, so it was honored as the authoritative contract
- `reveal_item_in_dir` used with `open_url` fallback — tauri-plugin-opener 2.5.3 has the method; fallback guards against any environment where it errors at runtime

## Deviations from Plan

None - plan executed exactly as written, with the minor naming alignment noted above (test contract was already set by 19-01 RED stubs).

## Issues Encountered
None — all three tasks completed first-pass without iteration.

## Next Phase Readiness
- WORKSPACE-01, WORKSPACE-03, WORKSPACE-05 server behaviors fully implemented and test-backed
- workspace-api.ts ready for Phase 19-03 (ProjectHomeScreen UI) to call its REST routes
- reveal_path IPC command available for frontend Reveal in Explorer buttons
- Phase 19-04 (ProjectTabBar) can rely on archiveProject/restoreProject REST routes

---
*Phase: 19-project-workspace*
*Completed: 2026-03-14*
