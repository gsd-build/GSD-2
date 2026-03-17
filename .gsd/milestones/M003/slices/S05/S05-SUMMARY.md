---
id: S05
parent: M003
milestone: M003
provides:
  - Browser-safe types for knowledge entries and capture entries (KnowledgeEntry, KnowledgeData, CaptureEntry, CapturesData, CaptureResolveRequest, CaptureResolveResult)
  - Captures child-process service (collectCapturesData, resolveCaptureAction) following forensics-service.ts pattern
  - Knowledge direct-read service (collectKnowledgeData) parsing KNOWLEDGE.md freeform headings + table format
  - /api/knowledge GET route returning parsed knowledge entries
  - /api/captures GET route returning capture entries with counts; POST route for manual triage
  - CommandSurfaceKnowledgeCapturesState contract types with phase/data/error lifecycle
  - Store actions: loadKnowledgeData(), loadCapturesData(), resolveCaptureAction()
  - Combined KnowledgeCapturesPanel component with Knowledge tab and Captures tab
  - Command surface wiring for gsd-knowledge, gsd-capture, gsd-triage sections with useEffect auto-load
requires:
  - slice: S01
    provides: Unified codebase with captures.ts (loadAllCaptures, markCaptureResolved) and KNOWLEDGE.md format
  - slice: S02
    provides: Dispatch entries routing /gsd knowledge, /gsd capture, /gsd triage to gsd-* surfaces
affects:
  - S08
key_files:
  - web/lib/knowledge-captures-types.ts
  - src/web/captures-service.ts
  - src/web/knowledge-service.ts
  - web/app/api/knowledge/route.ts
  - web/app/api/captures/route.ts
  - web/lib/command-surface-contract.ts
  - web/lib/gsd-workspace-store.tsx
  - web/components/gsd/knowledge-captures-panel.tsx
  - web/components/gsd/command-surface.tsx
key_decisions:
  - Knowledge service uses direct file read (no child process) since KNOWLEDGE.md is plain markdown
  - Captures service uses child-process pattern matching forensics-service.ts to avoid Turbopack .js→.ts resolution
  - Combined Knowledge+Captures panel with tab switching driven by command surface section
  - Panel implements its own lightweight PanelHeader/PanelError/PanelLoading/PanelEmpty helpers (diagnostics-panels.tsx helpers not exported)
  - POST validation returns 400 with specific field-level error messages
  - Both tabs pre-load data on section open for instant tab switching
patterns_established:
  - captures-service.ts follows same execFile+resolve-ts.mjs child-process pattern as forensics-service.ts
  - patchKnowledgeCapturesState / patchKnowledgeCapturesPhaseState follows same pattern as patchDoctorState / patchDiagnosticsPhaseState
  - Tab-based panel with initialTab prop driven by command surface section name
  - CaptureResolveRequest parameters serialized via JSON.stringify for safe subprocess interpolation
observability_surfaces:
  - /api/knowledge GET returns KnowledgeData JSON with entries, filePath, lastModified
  - /api/captures GET returns CapturesData JSON with entries, pendingCount, actionableCount
  - /api/captures POST returns CaptureResolveResult JSON; 400 on validation error; 500 on subprocess failure
  - commandSurface.knowledgeCaptures.knowledge.phase — idle/loading/loaded/error
  - commandSurface.knowledgeCaptures.captures.phase — idle/loading/loaded/error
  - commandSurface.knowledgeCaptures.resolveRequest.pending/lastError/lastResult — triage action lifecycle
drill_down_paths:
  - .gsd/milestones/M003/slices/S05/tasks/T01-SUMMARY.md
  - .gsd/milestones/M003/slices/S05/tasks/T02-SUMMARY.md
duration: 20m
verification_result: passed
completed_at: 2026-03-16
---

# S05: Knowledge and captures/triage page

**Combined browser panel for KNOWLEDGE.md entries and CAPTURES.md triage with two-tab UI, real data via API routes, and full triage action lifecycle.**

## What Happened

Built the complete server-to-browser pipeline in two tasks:

**T01 — Server-side data pipeline (types, services, routes).** Created browser-safe types in `knowledge-captures-types.ts` mirroring upstream captures.ts without Node.js dependencies. Built `captures-service.ts` using the established child-process pattern (execFile + resolve-ts.mjs loader) to call upstream `loadAllCaptures()` and `markCaptureResolved()` — necessary because captures.ts uses .js extension imports that Turbopack can't resolve. Built `knowledge-service.ts` as a direct file read since KNOWLEDGE.md is plain markdown with no .js import issue. The parser handles both freeform `## Heading` sections and structured table rows with K/P/L-prefixed IDs. Added `/api/knowledge` GET route and `/api/captures` GET+POST routes following the established forensics route pattern, with field-level validation returning 400 on bad POST bodies.

**T02 — Client-side integration (contract, store, panel, wiring).** Extended `command-surface-contract.ts` with `CommandSurfaceKnowledgeCapturesState` using the generic `CommandSurfaceDiagnosticsPhaseState<T>` pattern from S04. Added three store methods (`loadKnowledgeData`, `loadCapturesData`, `resolveCaptureAction`) with private patch helpers matching the diagnostics pattern. Created `KnowledgeCapturesPanel` as a two-tab component — Knowledge tab shows entries with type badges (rule/pattern/lesson/freeform), Captures tab shows entries with status badges (pending/triaged/resolved), classification labels, and triage action buttons for pending entries. Wired into `command-surface.tsx` so `/gsd knowledge` opens Knowledge tab, `/gsd capture` and `/gsd triage` open Captures tab. Both tabs pre-load data on section open for instant switching.

## Verification

- `npm run build` — exits 0 ✅
- `npm run build:web-host` — exits 0, both `/api/knowledge` and `/api/captures` routes compiled and staged ✅
- Parity contract tests — 114 pass, 4 fail (pre-existing `/gsd visualize` view-navigate vs surface issue, confirmed same on clean branch) ✅

## Requirements Advanced

- R106 — Knowledge and captures page now has real types, services, API routes, contract state, store actions, and UI panel. All three command dispatch entries (`gsd-knowledge`, `gsd-capture`, `gsd-triage`) render the real panel instead of placeholder content. API routes return structured data from upstream sources.
- R101 — Three more surface commands (`knowledge`, `capture`, `triage`) now render real content instead of S02 placeholders.
- R109 — Both tabs pre-load data on section open for instant switching, consistent with the snappy-and-fast quality bar.

## Requirements Validated

- R106 — `/api/knowledge` GET returns parsed KNOWLEDGE.md entries; `/api/captures` GET returns capture entries with counts; POST validates and resolves captures; panel renders both tabs with type/status badges and triage controls. Both builds pass with the new routes and component.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

None — both tasks executed exactly as planned.

## Known Limitations

- The 4 pre-existing parity contract test failures for `/gsd visualize` (view-navigate vs surface assertion) remain — these are from S03's intentional design choice (D053) and will be addressed in S08/S09.
- Panel helpers (PanelHeader/PanelError/PanelLoading/PanelEmpty) are duplicated between diagnostics-panels.tsx and knowledge-captures-panel.tsx — these could be extracted to a shared module but were kept local per plan to avoid modifying diagnostics-panels.tsx exports.

## Follow-ups

- S08 should consider extracting the shared PanelHeader/PanelError/PanelLoading/PanelEmpty helpers into a common module used by both diagnostics and knowledge/captures panels.
- S09 should fix the 4 `/gsd visualize` parity test assertions to account for the view-navigate dispatch kind.

## Files Created/Modified

- `web/lib/knowledge-captures-types.ts` — browser-safe types for knowledge and captures
- `src/web/captures-service.ts` — child-process service for captures data + triage actions
- `src/web/knowledge-service.ts` — direct-read service for KNOWLEDGE.md parsing
- `web/app/api/knowledge/route.ts` — GET route for knowledge data
- `web/app/api/captures/route.ts` — GET + POST routes for captures data and triage
- `web/lib/command-surface-contract.ts` — added knowledgeCaptures state interfaces, factory, WorkspaceCommandSurfaceState field
- `web/lib/gsd-workspace-store.tsx` — added patch helpers, 3 async load/resolve methods, ActionKey entries, hook entries
- `web/components/gsd/knowledge-captures-panel.tsx` — two-tab panel component
- `web/components/gsd/command-surface.tsx` — import, useEffect auto-load, renderSection wiring for 3 sections

## Forward Intelligence

### What the next slice should know
- The knowledge/captures services and API routes follow the exact same patterns as S04's diagnostics services. Any future surface that calls upstream extension code should use the child-process pattern from `captures-service.ts` (or `forensics-service.ts`). Direct file reads (like `knowledge-service.ts`) are only safe for plain markdown/text files with no .js extension imports.
- The command-surface-contract now has two generic phase state patterns: `CommandSurfaceDiagnosticsPhaseState<T>` for load-only data and `CommandSurfaceKnowledgeCapturesResolveState` for mutation lifecycle (pending/lastError/lastResult). S06 settings mutations should follow the resolve pattern.

### What's fragile
- The KNOWLEDGE.md parser in `knowledge-service.ts` handles both freeform headings and table rows, but assumes the table format uses `|`-delimited columns with K/P/L prefixed IDs in the first column. If upstream changes the knowledge file format, the parser will need updating.
- Panel helper duplication (PanelHeader/PanelError/PanelLoading/PanelEmpty) exists in two files now. If styling changes are needed, both files must be updated.

### Authoritative diagnostics
- `/api/knowledge` GET — returns structured JSON showing exactly what the parser extracts from KNOWLEDGE.md. Check here first if knowledge entries look wrong.
- `/api/captures` GET — returns structured JSON with entries and counts. Check here first if capture list is incomplete or counts are wrong.
- `commandSurface.knowledgeCaptures` in browser devtools — inspect phase states to diagnose loading issues.

### What assumptions changed
- No assumptions changed — the plan was accurate. The child-process pattern and contract state pattern both worked exactly as established in S04.
