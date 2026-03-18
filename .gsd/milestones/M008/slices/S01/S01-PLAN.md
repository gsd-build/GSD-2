# S01: Projects Page Redesign

**Goal:** Replace the projects grid with a styled vertical list where clicking a project expands it to show progress details (milestone, slice, tasks, cost for active project; milestone/slice/phase/tally for non-active projects).
**Demo:** Open projects view → projects render as a vertical list with kind badges and signal chips → click a project → detail panel expands inline showing progress → click again → detail collapses. Double-click or "Open" button navigates to the project.

## Must-Haves

- Projects render as a vertical list (not grid)
- Clicking a project toggles an expandable detail section
- Active project detail shows milestone/slice/task progress and cost from workspace store
- Non-active project detail shows milestone name, slice name, phase, and milestone completion tally from API
- `ProjectsView` and `DevRootSettingsSection` exports preserved and consumed by `app-shell.tsx` / `command-surface.tsx`
- Single-click expands; navigation requires explicit action (button or double-click) — not the current instant-navigate behavior
- `npm run build:web-host` exits 0

## Proof Level

- This slice proves: integration
- Real runtime required: yes (visual verification in browser)
- Human/UAT required: yes (layout and interaction check)

## Verification

- `npm run build:web-host` exits 0
- `rg "grid grid-cols" web/components/gsd/projects-view.tsx` returns empty (grid layout removed)
- `rg "ProjectsView|DevRootSettingsSection" web/components/gsd/app-shell.tsx web/components/gsd/command-surface.tsx` still shows both imports
- Visual: projects list renders, clicking expands detail, double-click navigates
- API diagnostic: `curl "http://localhost:3000/api/projects?root=...&detail=true"` returns projects with `progress` field; omitting `detail` returns projects without `progress`
- Failure path: project with no `.gsd/STATE.md` returns `progress: null` (not an error)

## Integration Closure

- Upstream surfaces consumed: `discoverProjects()` from `project-discovery-service.ts`, `/api/projects` route, `WorkspaceIndex`/`getLiveWorkspaceIndex()`/`getLiveAutoDashboard()` from `gsd-workspace-store.tsx`, `useProjectStoreManager()` from `project-store-manager.tsx`
- New wiring introduced: `ProjectProgressInfo` type + `progress` field on `ProjectMetadata`, `?detail=true` query param on API route, `expandedProject` state in `ProjectsView`
- What remains before the milestone is truly usable end-to-end: S02–S05 are independent slices

## Tasks

- [x] **T01: Extend project discovery service with progress data from STATE.md** `est:30m`
  - Why: Non-active projects need milestone/slice/phase/tally data. The service must read each project's `.gsd/STATE.md` and return structured progress info. The API route must pass the `?detail=true` flag through.
  - Files: `src/web/project-discovery-service.ts`, `web/app/api/projects/route.ts`
  - Do: Add `ProjectProgressInfo` interface (`activeMilestone`, `activeSlice`, `phase`, `milestonesCompleted`, `milestonesTotal`). Add `readProjectProgress(projectPath)` function that reads `.gsd/STATE.md` with `readFileSync`, parses milestone/slice/phase via regex, counts `✅` vs `🔄` lines in the registry. Add optional `includeProgress` param to `discoverProjects()`. Update API route to read `?detail=true` and pass it through. Keep all I/O synchronous to match existing pattern.
  - Verify: `npm run build:web-host` exits 0
  - Done when: API returns `progress` field on each project when `?detail=true` is passed; build passes

- [ ] **T02: Redesign projects-view from grid to expandable list** `est:1h`
  - Why: This is the core UI change — replace grid layout with vertical list, add expand/collapse interaction with detail panel, consume progress data from both workspace store (active) and API (non-active).
  - Files: `web/components/gsd/projects-view.tsx`
  - Do: Replace `grid grid-cols-*` with `flex flex-col gap-2`. Each row is a clickable div showing project name, kind badge, and signal chips on one line. Add `expandedProject` state (path or null). Single click toggles expansion. Expanded section renders: for active project — milestone/slice name, task progress bar, cost from `getLiveAutoDashboard()`; for non-active — milestone name, slice name, phase, milestone tally from API `progress` field. Add explicit "Open" button in expanded section for navigation, plus double-click on row. Preserve `ProjectsView` and `DevRootSettingsSection` exports. Do NOT touch `FolderPickerDialog`, `DevRootSetup`, or `KIND_CONFIG` colors (S03 handles colors).
  - Verify: `npm run build:web-host` exits 0, `rg "grid grid-cols" web/components/gsd/projects-view.tsx` returns empty, both exports still imported by consumers
  - Done when: Projects render as a styled list with expandable detail; build passes

## Files Likely Touched

- `src/web/project-discovery-service.ts`
- `web/app/api/projects/route.ts`
- `web/components/gsd/projects-view.tsx`
: null` rather than throwing. Parse failures for individual fields yield `null` for that field while preserving others.
- **Browser diagnostics:** Network tab shows `/api/projects?detail=true` request and response shape. Console errors from fetch failures are logged by the existing error boundary.
- **Redaction:** No secrets or credentials involved in this slice.

## Files Likely Touched

- `src/web/project-discovery-service.ts`
- `web/app/api/projects/route.ts`
- `web/components/gsd/projects-view.tsx`
