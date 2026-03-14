---
phase: 19-project-workspace
plan: "03"
subsystem: ui
tags: [react, tsx, workspace, project-grid, lucide-react, tauri-ipc]

# Dependency graph
requires:
  - phase: 19-01
    provides: RED test stubs for project-home-screen.test.tsx
  - phase: 19-02
    provides: RecentProject extended type with archived/activeMilestone/progressPercent/lastActivity

provides:
  - ProjectCard component with name, relativeTime, milestone, progress bar, Resume button, ··· menu trigger
  - ProjectCardMenu component with Archive/Open in Finder/Remove from list actions and Tauri IPC reveal_path
  - ProjectHomeScreen component with mode-aware empty states, project grid, and archived toggle

affects: [19-04, 19-05, 20-tauri-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Inline absolute-positioned dropdown menu (no library) for ProjectCardMenu
    - Optional projects prop for test/SSR pre-loading to avoid fetch() in renderToString
    - Tauri IPC dynamic import with catch fallback for non-Tauri environments
    - relativeTime() inline helper (no date library) per research anti-pattern guidance

key-files:
  created:
    - packages/mission-control/src/components/workspace/ProjectCard.tsx
    - packages/mission-control/src/components/workspace/ProjectCardMenu.tsx
    - packages/mission-control/src/components/workspace/ProjectHomeScreen.tsx
  modified: []

key-decisions:
  - "ProjectHomeScreen accepts optional projects prop — when provided (tests/SSR), skips fetch(); when absent, fetches /api/projects/recent on mount"
  - "ProjectCardMenu rendered always-visible (parent controls open state via useState in ProjectCard); absolute-positioned div per research anti-pattern guidance"
  - "Tauri reveal_path IPC wrapped in dynamic import + catch — silently no-ops outside Tauri context (test and web environments)"

patterns-established:
  - "Optional pre-loaded prop pattern: component accepts data prop that bypasses fetch for test/SSR compatibility"
  - "Inline menu pattern: absolute-positioned div without portal or library component for dropdowns"

requirements-completed: [WORKSPACE-02, WORKSPACE-03]

# Metrics
duration: 12min
completed: 2026-03-14
---

# Phase 19 Plan 03: Project Workspace Home Screen Summary

**Three React workspace components: ProjectCard (name/timestamp/milestone/progress bar/Resume), ProjectCardMenu (Archive/Finder/Remove with Tauri IPC), and ProjectHomeScreen (mode-aware grid with archived toggle) — all 4 project-home-screen tests GREEN, 760 total pass**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-14T14:59:19Z
- **Completed:** 2026-03-14T15:11:00Z
- **Tasks:** 2
- **Files modified:** 3 created

## Accomplishments

- ProjectCard renders project name (Share Tech Mono), relative last-active time, active milestone (cyan badge), progress bar (cyan fill on dark track), Resume button (cyan bg), and ··· trigger opening ProjectCardMenu
- ProjectCardMenu provides Archive (PATCH /api/projects/recent/archive), Open in Finder/Explorer (Tauri IPC reveal_path with non-Tauri fallback), and Remove from list (DELETE /api/projects/recent) — absolute-positioned inline dropdown, no library
- ProjectHomeScreen fetches /api/projects/recent on mount; Developer empty state shows Open Folder button; Builder empty state shows project name input + Create project button; archived toggle with Restore action; grid adapts to min-340px columns

## Task Commits

1. **Task 1: ProjectCard + ProjectCardMenu components** - `dfc60d3` (feat)
2. **Task 2: ProjectHomeScreen — grid, empty states, archived toggle** - `6f07546` (feat)

## Files Created/Modified

- `packages/mission-control/src/components/workspace/ProjectCard.tsx` — project card with relativeTime helper, progress bar, Resume button, ··· trigger (160 lines)
- `packages/mission-control/src/components/workspace/ProjectCardMenu.tsx` — dropdown menu with Archive/Finder/Remove actions and Tauri IPC (130 lines)
- `packages/mission-control/src/components/workspace/ProjectHomeScreen.tsx` — full-screen grid with mode-aware empty states, fetch on mount, archived toggle (297 lines)

## Decisions Made

- **Optional projects prop**: `ProjectHomeScreen` accepts an optional `projects?: RecentProject[]` prop. When provided (as in tests using `renderToString`), the component skips the `useEffect` fetch entirely. This avoids `fetch()` side effects in server-side rendering and test contexts while maintaining normal API-fetch behavior in the browser.
- **ProjectCardMenu always-visible**: The menu div is always rendered when `menuOpen === true` (controlled by useState in ProjectCard). It uses an absolute-positioned div rather than a portal or library component, matching the research anti-pattern guidance to avoid complexity.
- **Tauri IPC dynamic import**: `reveal_path` is called via `await import('@tauri-apps/api/core')` inside a try/catch. This prevents the import from throwing at module load time in non-Tauri environments (test runner, web browser).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test API mismatch] Test file passes different prop signatures than plan specifies**
- **Found during:** Task 1 (RED phase inspection)
- **Issue:** `project-home-screen.test.tsx` passes `projects: []` to `ProjectHomeScreen` (not internal-fetch-only), and passes `project: projectFixture` to `ProjectCard`/`ProjectCardMenu` (full object, not path string + callbacks). The plan's prop contracts omitted the test-compatibility surface.
- **Fix:** Added optional `projects?: RecentProject[]` prop to `ProjectHomeScreen`; changed `ProjectCard` props so `onResume`/`onRefresh` are optional; `ProjectCardMenu` receives `project: RecentProject` instead of `path: string`. All plan behavior requirements preserved — only made callback props optional and added the pre-load shortcut.
- **Files modified:** All three component files
- **Committed in:** dfc60d3, 6f07546

---

**Total deviations:** 1 auto-fixed (Rule 1 — test API surface reconciliation)
**Impact on plan:** Minimal — no behavior change; all plan requirements met and all 4 test cases pass GREEN.

## Issues Encountered

None — tests went RED → GREEN in a single implementation pass.

## Next Phase Readiness

- All three workspace components ready for integration into AppShell / routing logic (Plan 19-04/19-05)
- ProjectHomeScreen wires cleanly to onOpenProject/onOpenFolder/onCreateProject callbacks from parent
- WORKSPACE-02 and WORKSPACE-03 requirements satisfied

---
*Phase: 19-project-workspace*
*Completed: 2026-03-14*
