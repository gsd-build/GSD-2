# S01 (Projects Page Redesign) — Research

**Date:** 2026-03-18
**Depth:** Light — straightforward UI redesign with known patterns and no external dependencies.

## Summary

This slice replaces the grid-based projects view with a vertical list where clicking a project expands it inline to show progress details. The server side needs a small extension: `discoverProjects()` in `project-discovery-service.ts` should optionally read each project's `.gsd/STATE.md` to extract milestone name, slice name, phase, and a milestone completion tally. The API route adds a `?detail=true` parameter. The client redesign is a single-file change in `projects-view.tsx` — swap the grid for a list, add an `expandedProject` state, and render a collapsible detail panel below the selected row. For the active project, progress comes from the workspace store (which already has full `WorkspaceIndex` with task-level completion); for non-active projects, progress comes from the API response.

Two exports from `projects-view.tsx` are consumed externally and must be preserved: `ProjectsView` (used by `app-shell.tsx`) and `DevRootSettingsSection` (used by `command-surface.tsx`).

## Recommendation

Single task, three files. Extend `discoverProjects()` with an optional `includeProgress` flag that reads `.gsd/STATE.md` via regex for the active milestone/slice/phase lines. Update the API route to pass `?detail=true` through. Redesign the projects-view component from grid to list with expandable detail. No new dependencies, no new components in separate files — the existing file structure is sufficient.

## Implementation Landscape

### Key Files

- `src/web/project-discovery-service.ts` — Currently returns `ProjectMetadata[]` with name/path/kind/signals/lastModified. Extend with an optional progress reading that parses `.gsd/STATE.md` for `**Active Milestone:**`, `**Active Slice:**`, `**Phase:**` lines. Also count milestone registry `✅` vs `🔄` lines for a completion tally. Add a `ProjectProgressInfo` interface with `{ activeMilestone, activeSlice, phase, milestonesCompleted, milestonesTotal }`. Return it as an optional `progress` field on `ProjectMetadata`.

- `web/app/api/projects/route.ts` — Currently calls `discoverProjects(root)`. Add `detail` query param parsing and pass through. Trivial — 2-3 lines changed.

- `web/components/gsd/projects-view.tsx` (~650 lines) — The main redesign target. Currently renders a `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` of project cards. Replace with a vertical list (`flex flex-col gap-2`). Each row is a button showing project name, kind badge, and signal chips on one line. Add `expandedProject` state (project path or null). When a row is clicked, toggle expansion. The expanded section shows:
  - For the **active project**: milestone/slice/task progress from the workspace store (`getLiveWorkspaceIndex()` gives `WorkspaceIndex` with `milestones[].slices[].tasks[].done`), cost from `getLiveAutoDashboard().totalCost`, phase from `workspace.active.phase`.
  - For **non-active projects**: milestone name, slice name, phase, and milestone tally from the `progress` field returned by the API.
  
  Double-click or a "Open" button navigates to the project (existing `handleSelectProject` logic).

- `web/lib/gsd-workspace-store.tsx` — Already provides all needed types and helpers: `WorkspaceIndex`, `WorkspaceMilestoneTarget`, `WorkspaceSliceTarget`, `WorkspaceTaskTarget`, `getCurrentSlice()`, `getCurrentScopeLabel()`, `formatCost()`, `getLiveWorkspaceIndex()`, `getLiveAutoDashboard()`. No changes needed — consume only.

- `web/lib/project-store-manager.tsx` — Provides `useProjectStoreManager()` and `activeProjectCwd` snapshot. Already imported by projects-view. No changes needed.

### Consumers to Preserve

- `web/components/gsd/app-shell.tsx` imports `ProjectsView` — renders at `activeView === "projects"`
- `web/components/gsd/command-surface.tsx` imports `DevRootSettingsSection` — renders in workspace and settings sections

### Build Order

1. Extend `project-discovery-service.ts` with progress reading — this is the data source for non-active projects
2. Update `/api/projects/route.ts` to pass `?detail=true`
3. Redesign `projects-view.tsx` — list layout + expandable detail panel
4. Verify with `npm run build:web-host`

### Verification Approach

- `npm run build:web-host` exits 0 — contract verification
- Visual: projects render as a list, clicking one expands progress detail (UAT)
- Both exports (`ProjectsView`, `DevRootSettingsSection`) remain functional

## Constraints

- STATE.md format is not schema-validated — parse with regexes defensively, return null fields when lines are missing
- `discoverProjects()` is synchronous (`readdirSync`, `statSync`) — keep progress reading synchronous too (`readFileSync`)
- The `KIND_CONFIG` object uses raw Tailwind accent colors (`emerald-500/15`, `sky-500/15`, etc.) — do NOT fix these here; S03 handles the color audit
- `FolderPickerDialog` and `DevRootSetup` components (~200 lines) must remain intact — they're working infrastructure, not part of the redesign

## Common Pitfalls

- **Expanding vs navigating** — clicking a project currently navigates immediately (`handleSelectProject`). The redesign needs to separate expand (single click toggles detail) from navigate (explicit button or double-click within the expanded section). Don't break the switching dialog flow.
- **Active project detection** — `activeProjectCwd === project.path` is the identity check. For the expanded active project, read from the workspace store; for all others, read from the API `progress` field. Don't mix the two data sources.
