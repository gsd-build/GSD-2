# S05: Knowledge and captures/triage page

**Goal:** Dedicated browser panel showing KNOWLEDGE.md entries and CAPTURES.md with pending/triaged/resolved status, classification labels, and triage action controls — accessible via `/gsd knowledge`, `/gsd capture`, and `/gsd triage`.
**Demo:** Type `/gsd knowledge` in the browser terminal → command surface opens showing parsed KNOWLEDGE.md entries with type badges. Type `/gsd capture` → same panel focuses Captures tab showing capture entries with status badges and classification labels. Pending captures show triage action buttons. Type `/gsd triage` → same panel focuses Captures tab with pending items highlighted.

## Must-Haves

- Browser-safe types for knowledge entries and capture entries
- `captures-service.ts` using child-process pattern to call upstream `loadAllCaptures()` and `markCaptureResolved()`
- `knowledge-service.ts` reading KNOWLEDGE.md directly (freeform headings + table format parser)
- `/api/knowledge` GET route returning parsed knowledge entries
- `/api/captures` GET route returning capture entries with counts; POST route for manual triage
- `knowledgeCaptures` state in command-surface contract with phase/data/error lifecycle
- Store actions: `loadKnowledgeData()`, `loadCapturesData()`, `resolveCaptureAction()`
- Combined `KnowledgeCapturesPanel` component with Knowledge tab and Captures tab
- `gsd-knowledge` section renders Knowledge tab focused; `gsd-capture`/`gsd-triage` render Captures tab focused
- useEffect auto-load trigger when sections open (same pattern as diagnostics)

## Proof Level

- This slice proves: integration
- Real runtime required: yes (API routes call upstream modules via child process / file read)
- Human/UAT required: no

## Verification

- `npm run build` — TypeScript compilation with all new types and files
- `npm run build:web-host` — Next.js production build including new API routes and panel component
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 118 existing tests still pass (regression)

## Observability / Diagnostics

- Runtime signals: `knowledgeCaptures.knowledge.phase` and `knowledgeCaptures.captures.phase` state transitions (idle→loading→loaded/error)
- Inspection surfaces: `/api/knowledge` GET returns JSON; `/api/captures` GET returns JSON; POST returns resolve result
- Failure visibility: `phase: "error"` with error message string in store state; API routes return `{ error: string }` with 500 status on failure
- Redaction constraints: none — knowledge and captures contain no secrets

## Integration Closure

- Upstream surfaces consumed: `captures.ts` (`loadAllCaptures`, `markCaptureResolved` via child process), `KNOWLEDGE.md` (direct file read), `paths.ts` (`gsdRoot` via child process)
- New wiring introduced: two API routes (`/api/knowledge`, `/api/captures`), two service files, `knowledgeCaptures` state branch in command-surface contract, panel component rendered for `gsd-knowledge`/`gsd-capture`/`gsd-triage` sections
- What remains before the milestone is truly usable end-to-end: S06 (settings), S07 (remaining commands), S08 (parity audit), S09 (test hardening)

## Tasks

- [ ] **T01: Create types, services, and API routes for knowledge and captures** `est:40m`
  - Why: Builds the entire server-side data pipeline — types define the API shape, services call upstream code, API routes expose data to the browser. No existing large files need modification.
  - Files: `web/lib/knowledge-captures-types.ts`, `src/web/captures-service.ts`, `src/web/knowledge-service.ts`, `web/app/api/knowledge/route.ts`, `web/app/api/captures/route.ts`
  - Do: (1) Create browser-safe types file with `KnowledgeEntry`, `KnowledgeData`, `CapturesData`, `CaptureEntry` mirror, `CaptureResolveRequest`, `CaptureResolveResult`. (2) Create `captures-service.ts` following the `forensics-service.ts` child-process pattern exactly — `execFile` with `--import resolve-ts.mjs --experimental-strip-types --input-type=module --eval <script>`, script imports `loadAllCaptures` from captures.ts via `pathToFileURL`, writes JSON to stdout. Add `resolveCaptureAction()` calling `markCaptureResolved` similarly. (3) Create `knowledge-service.ts` that reads KNOWLEDGE.md directly via `readFileSync` using `resolveBridgeRuntimeConfig().projectCwd + "/.gsd/KNOWLEDGE.md"`. Parser must handle both freeform `## Title` sections with prose AND structured table rows (`| K001 | scope | rule | ... |`). (4) Create GET route `/api/knowledge` calling `collectKnowledgeData()`. (5) Create `/api/captures` with GET calling `collectCapturesData()` and POST calling `resolveCaptureAction()`.
  - Verify: `npm run build` succeeds
  - Done when: All 5 new files compile, `npm run build` exits 0

- [ ] **T02: Add contract state, store actions, panel component, and wire into command surface** `est:50m`
  - Why: Completes the client-side integration — state management, data fetching, UI rendering, and routing from the command surface dispatch. This replaces the S02 placeholder content with the real knowledge/captures panel.
  - Files: `web/lib/command-surface-contract.ts`, `web/lib/gsd-workspace-store.tsx`, `web/components/gsd/knowledge-captures-panel.tsx`, `web/components/gsd/command-surface.tsx`
  - Do: (1) In `command-surface-contract.ts`: add `CommandSurfaceKnowledgeCapturesState` interface with `knowledge: CommandSurfaceDiagnosticsPhaseState<KnowledgeData>`, `captures: CommandSurfaceDiagnosticsPhaseState<CapturesData>`, `resolveRequest: { pending: boolean; lastError: string | null; lastResult: CaptureResolveResult | null }`. Add `knowledgeCaptures` to `WorkspaceCommandSurfaceState`. Add `createInitialKnowledgeCapturesState()`. (2) In `gsd-workspace-store.tsx`: add private `patchKnowledgeCapturesState()` helper mirroring `patchDiagnosticsPhaseState()`. Add `loadKnowledgeData()`, `loadCapturesData()`, `resolveCaptureAction()` methods. Register in ActionKey union and useGSDWorkspaceActions hook. (3) Create `knowledge-captures-panel.tsx` with combined panel: two-tab layout (Knowledge / Captures), knowledge tab shows entries with type badges, captures tab shows entries with status badges + classification labels + triage action buttons for pending entries. Implement lightweight PanelHeader/PanelError/PanelLoading/PanelEmpty helpers (do NOT import from diagnostics-panels.tsx — those shared components are not exported). (4) In `command-surface.tsx`: replace `gsd-knowledge`/`gsd-capture`/`gsd-triage` cases to render `KnowledgeCapturesPanel` with appropriate initial tab. Add useEffect auto-load trigger for these sections (same pattern as diagnostics at line ~385).
  - Verify: `npm run build` and `npm run build:web-host` succeed; `npx tsx --test src/tests/web-command-parity-contract.test.ts` passes 118 tests
  - Done when: `/gsd knowledge`, `/gsd capture`, `/gsd triage` render the real panel (not placeholder), both builds pass, parity contract tests still pass

## Files Likely Touched

- `web/lib/knowledge-captures-types.ts` (new)
- `src/web/captures-service.ts` (new)
- `src/web/knowledge-service.ts` (new)
- `web/app/api/knowledge/route.ts` (new)
- `web/app/api/captures/route.ts` (new)
- `web/lib/command-surface-contract.ts` (modify — add knowledgeCaptures state)
- `web/lib/gsd-workspace-store.tsx` (modify — add load/resolve actions)
- `web/components/gsd/knowledge-captures-panel.tsx` (new)
- `web/components/gsd/command-surface.tsx` (modify — wire panel, add useEffect)
