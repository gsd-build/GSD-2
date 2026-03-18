---
id: T01
parent: S01
milestone: M008
provides:
  - ProjectProgressInfo interface and readProjectProgress() function
  - progress field on ProjectMetadata (optional)
  - detail=true query param on /api/projects route
key_files:
  - src/web/project-discovery-service.ts
  - web/app/api/projects/route.ts
key_decisions:
  - Used spread with conditional to attach progress field only when includeProgress is true, keeping JSON output clean when detail is not requested
patterns_established:
  - STATE.md parsing via line-by-line iteration with defensive null returns per field
observability_surfaces:
  - /api/projects?root=...&detail=true returns progress field per project
  - readProjectProgress() exported for direct single-project inspection
duration: ~10min
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Extend project discovery service with progress data from STATE.md

**Added `ProjectProgressInfo` type, `readProjectProgress()` parser, and `?detail=true` API passthrough for non-active project progress data.**

## What Happened

Extended `project-discovery-service.ts` with:
1. `ProjectProgressInfo` interface — `activeMilestone`, `activeSlice`, `phase`, `milestonesCompleted`, `milestonesTotal`
2. Optional `progress` field on `ProjectMetadata`
3. `readProjectProgress(projectPath)` — reads `.gsd/STATE.md` synchronously, parses active milestone/slice/phase via prefix matching, counts `✅` and `🔄` lines for milestone tally. Returns `null` on file-missing or read error.
4. `discoverProjects()` gained optional `includeProgress` param — when true, calls `readProjectProgress()` per project and attaches result.
5. API route reads `?detail=true` query param and passes `true` to `discoverProjects()`.

All I/O remains synchronous (`readFileSync`). The `discoverProjects` signature is fully backward-compatible.

## Verification

- `npm run build:web-host` exits 0 ✅
- `rg "ProjectProgressInfo" src/web/project-discovery-service.ts` shows interface, type usage, and function return type ✅
- `rg "detail" web/app/api/projects/route.ts` shows query param reading and passthrough ✅
- All 10 existing project-discovery contract tests pass (backward compat confirmed) ✅

### Slice-level checks (intermediate — partial pass expected):
- Build exits 0 ✅
- Grid layout still present in projects-view.tsx (expected — T02 removes it) ⏳
- ProjectsView + DevRootSettingsSection exports preserved and consumed ✅
- Visual verification deferred to T02 ⏳

## Diagnostics

- **API:** `curl "http://localhost:3000/api/projects?root=/path&detail=true"` — each project includes `progress` with milestone/slice/phase/tally, or `progress: null` if no STATE.md.
- **Without detail:** `curl "http://localhost:3000/api/projects?root=/path"` — no `progress` field in response (backward-compatible).
- **Direct inspection:** `readProjectProgress("/path/to/project")` is exported and callable for single-project debugging.
- **Failure shape:** Missing/unreadable STATE.md → `null`. Unparseable individual lines → that field is `null` (others still populate).

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/web/project-discovery-service.ts` — added `ProjectProgressInfo` interface, `readProjectProgress()` function, optional `progress` field on `ProjectMetadata`, `includeProgress` param on `discoverProjects()`
- `web/app/api/projects/route.ts` — reads `?detail=true` query param and passes through to `discoverProjects()`
- `.gsd/milestones/M008/slices/S01/S01-PLAN.md` — added Observability / Diagnostics section and failure-path verification
- `.gsd/milestones/M008/slices/S01/tasks/T01-PLAN.md` — added Observability Impact section
