---
estimated_steps: 6
estimated_files: 2
---

# T04: Build all 10 panel components, wire into command-surface.tsx, and verify builds

**Slice:** S07 — Remaining Command Surfaces
**Milestone:** M003

## Description

The visible output of S07: create `remaining-command-panels.tsx` with 10 panel components, replace all placeholder switch cases in `command-surface.tsx` with real panel rendering, extend the auto-loader useEffect for surfaces that need data fetching, and remove the placeholder fallback text. After this task, no GSD surface shows "This surface will be implemented in a future update."

Relevant skill: `frontend-design` — load this skill for panel component styling patterns.

## Steps

1. **Read pattern references** to understand existing panel structure:
   - `web/components/gsd/diagnostics-panels.tsx` (525 lines) — ForensicsPanel, DoctorPanel, SkillHealthPanel patterns
   - `web/components/gsd/settings-panels.tsx` (498 lines) — PrefsPanel, ModelRoutingPanel, BudgetPanel patterns
   - Both use: `useGSDWorkspace()` hook, loading/error/loaded phase rendering, shadcn/ui components (Button, Badge, Card), Lucide icons

2. **Create `web/components/gsd/remaining-command-panels.tsx`** with 10 exported components:

   **QuickPanel** — Static content (no data fetch). Show usage instructions: "`/gsd quick <description>` — Create a quick one-off task outside the current plan." Show example commands. Match TUI's bare `/gsd quick` behavior (usage text, not a listing).

   **HistoryPanel** — Uses `loadHistoryData()` from store. Show loading/error states. On loaded: display project totals (units, cost, duration), tabbed breakdowns for by-phase, by-slice, by-model tables, and a recent units list. Use `formatDuration`-style display (convert ms to human-readable). Use `formatCost`-style display ($X.XX).

   **UndoPanel** — Uses `loadUndoInfo()`. Show last completed unit info (type, ID, key). Show completed count. Show associated commit SHAs. Provide a "Confirm Undo" button that calls `executeUndoAction()` from the store. Show confirmation dialog before executing. Show success/error result after execution.

   **SteerPanel** — Uses `loadSteerData()`. Display current OVERRIDES.md content in a read-only block (or "No active overrides" if null). Provide a textarea + submit form that calls the existing `store.sendSteer(message)` (already wired from S02). The steer command sends a message through the bridge; the overrides display shows what's been persisted.

   **HooksPanel** — Uses `loadHooksData()`. Show a table of hook entries: name, type (post/pre), enabled status (badge), target unit types, active cycle counts. Show formatted status string below the table.

   **InspectPanel** — Uses `loadInspectData()`. Show GSD database overview: schema version, counts (decisions, requirements, artifacts). Show recent decisions table (id, decision, choice). Show recent requirements table (id, status, description).

   **ExportPanel** — Uses `loadExportData(format)` from store. Show format selector (markdown/json radio or buttons). Show "Generate Export" button. On click, call loadExportData with selected format. When loaded, trigger a client-side blob download using `URL.createObjectURL()` per D052. Show the filename and a re-download button.

   **CleanupPanel** — Uses `loadCleanupData()`. Show branches table with name and merged status (badge). Show snapshots table with ref and date. Provide "Delete Merged Branches" and "Prune Old Snapshots" buttons that call `executeCleanupAction()`. Show result after execution.

   **QueuePanel** — Uses existing workspace data (no new API). Access `store.milestones` (the `WorkspaceMilestoneTarget[]` already loaded from `/api/live-state?domain=workspace`). Display milestone registry: id, title, status. TUI's `showQueue()` shows exactly this.

   **StatusPanel** — Uses existing workspace data (no new API). Access workspace state already in the store (active milestone, slice, task, phase). Display a summary card matching TUI's status overlay. Show current active context and recent activity.

3. **Wire panels into `command-surface.tsx` renderSection() switch:**
   - Import all 10 panels from `./remaining-command-panels`
   - Add explicit case statements for each surface:
     ```ts
     case "gsd-quick": return <QuickPanel />
     case "gsd-history": return <HistoryPanel />
     case "gsd-undo": return <UndoPanel />
     case "gsd-steer": return <SteerPanel />
     case "gsd-hooks": return <HooksPanel />
     case "gsd-inspect": return <InspectPanel />
     case "gsd-export": return <ExportPanel />
     case "gsd-cleanup": return <CleanupPanel />
     case "gsd-queue": return <QueuePanel />
     case "gsd-status": return <StatusPanel />
     ```
   - **Remove the placeholder fallback text** from the `startsWith("gsd-")` block. The block should still exist as a safety net but the text "This surface will be implemented in a future update" should be replaced with a minimal "Unknown GSD surface" message (or removed entirely if all surfaces are covered).

4. **Extend the auto-loader useEffect** in `command-surface.tsx`:
   - Add load calls for surfaces that need data fetching when their section opens and phase is "idle":
     ```ts
     const remainingCommands = commandSurface.remainingCommands
     // ... in the useEffect body:
     else if (commandSurface.section === "gsd-history" && remainingCommands.history.phase === "idle") {
       void loadHistoryData()
     } else if (commandSurface.section === "gsd-inspect" && remainingCommands.inspect.phase === "idle") {
       void loadInspectData()
     } else if (commandSurface.section === "gsd-hooks" && remainingCommands.hooks.phase === "idle") {
       void loadHooksData()
     } else if (commandSurface.section === "gsd-undo" && remainingCommands.undo.phase === "idle") {
       void loadUndoInfo()
     } else if (commandSurface.section === "gsd-cleanup" && remainingCommands.cleanup.phase === "idle") {
       void loadCleanupData()
     } else if (commandSurface.section === "gsd-steer" && remainingCommands.steer.phase === "idle") {
       void loadSteerData()
     }
     ```
   - Export is intentionally NOT auto-loaded — it triggers on user button click with a format choice
   - Quick, queue, and status don't auto-load — they use static content or existing workspace data
   - Add the new phase properties and load functions to the useEffect dependency array

5. **Destructure the new store functions** at the top of the CommandSurface component where `useGSDWorkspace()` is called. Add `loadHistoryData`, `loadInspectData`, `loadHooksData`, `loadExportData`, `loadUndoInfo`, `loadCleanupData`, `loadSteerData`, `executeUndoAction`, `executeCleanupAction` to the destructuring.

6. **Verify all builds and tests:**
   - `npm run build` — TypeScript compilation passes
   - `npm run build:web-host` — Next.js production build passes
   - `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 118 tests still pass (dispatch unchanged)
   - `rg "This surface will be implemented" web/components/gsd/command-surface.tsx` — returns 0 matches

## Must-Haves

- [ ] `remaining-command-panels.tsx` exists with 10 exported panel components
- [ ] All 10 switch cases added to `renderSection()` in `command-surface.tsx`
- [ ] Auto-loader useEffect extended for 6 data-fetching surfaces (history, inspect, hooks, undo, cleanup, steer)
- [ ] Placeholder "This surface will be implemented" text is removed
- [ ] `npm run build` succeeds
- [ ] `npm run build:web-host` succeeds
- [ ] `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 118 tests pass

## Verification

- `npm run build` — exit 0
- `npm run build:web-host` — exit 0
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 118 pass, 0 fail
- `rg "This surface will be implemented" web/components/gsd/command-surface.tsx` — 0 matches
- `rg "QuickPanel|HistoryPanel|UndoPanel|SteerPanel|HooksPanel|InspectPanel|ExportPanel|CleanupPanel|QueuePanel|StatusPanel" web/components/gsd/remaining-command-panels.tsx` — all 10 found

## Inputs

- `web/components/gsd/diagnostics-panels.tsx` — **primary pattern reference** for panel components. Read first. Shows: hook destructuring, phase-based rendering (loading spinner, error message, loaded content), shadcn/ui usage, layout patterns.
- `web/components/gsd/settings-panels.tsx` — second pattern reference.
- `web/components/gsd/command-surface.tsx` — the orchestrator to wire into. Key locations:
  - `renderSection()` function (around line 1955) — add switch cases here
  - Auto-loader useEffect (around line 390) — extend with new surfaces
  - `useGSDWorkspace()` destructuring (near top) — add new store functions
- `web/lib/gsd-workspace-store.tsx` — T03 output, provides load functions to destructure
- `web/lib/remaining-command-types.ts` — T01 output, type shapes for rendering
- `web/lib/command-surface-contract.ts` — T01 output, `remainingCommands` state for phase checks

## Observability Impact

- **Panel phase transitions:** Each of the 7 data-fetching panels (history, inspect, hooks, undo, cleanup, steer, export) transitions `commandSurface.remainingCommands.<name>.phase` through `idle → loading → loaded/error`. Observable in React DevTools on the Zustand store.
- **Auto-loader triggers:** Opening a panel section in the command surface auto-fires the corresponding load function when phase is `idle`. Visible in browser network tab as GET requests to `/api/{history,inspect,hooks,undo,cleanup,steer}`.
- **Error visibility:** API failures surface as `phase: "error"` with `error` string in the panel's phase state. Each panel renders error inline via `<PanelError>`.
- **Mutation feedback:** UndoPanel and CleanupPanel show result banners after mutations (success/failure). ExportPanel triggers client-side blob download on success.
- **Static panels:** QuickPanel, QueuePanel, StatusPanel use existing workspace data — no additional API calls. QueuePanel reads `workspace.milestones`, StatusPanel reads `workspace.active`.

## Expected Output

- `web/components/gsd/remaining-command-panels.tsx` — ~600-800 lines with 10 panel components
- `web/components/gsd/command-surface.tsx` — modified: 10 new switch cases, extended auto-loader, placeholder text removed
