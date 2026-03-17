---
estimated_steps: 4
estimated_files: 4
---

# T02: Add contract state, store actions, panel component, and wire into command surface

**Slice:** S05 — Knowledge and captures/triage page
**Milestone:** M003

## Description

Complete the client-side integration: add state management to the command-surface contract, add fetch/resolve actions to the workspace store, create the combined Knowledge/Captures panel component, and wire everything into the command surface replacing the S02 placeholder rendering.

This task modifies three existing files (`command-surface-contract.ts`, `gsd-workspace-store.tsx`, `command-surface.tsx`) and creates one new file (`knowledge-captures-panel.tsx`). Follow the exact patterns established by S04's diagnostics integration.

**Relevant skill:** `frontend-design` — load if the panel component styling needs attention, but the pattern is well-established from `diagnostics-panels.tsx`.

## Steps

1. **Modify `web/lib/command-surface-contract.ts`** — add knowledge/captures state:

   Add after the existing `CommandSurfaceDiagnosticsState` block (around line 375):

   ```ts
   // ─── Knowledge/Captures panel state ──────────────────────────────────────────

   export interface CommandSurfaceKnowledgeCapturesResolveState {
     pending: boolean
     lastError: string | null
     lastResult: CaptureResolveResult | null
   }

   export interface CommandSurfaceKnowledgeCapturesState {
     knowledge: CommandSurfaceDiagnosticsPhaseState<KnowledgeData>
     captures: CommandSurfaceDiagnosticsPhaseState<CapturesData>
     resolveRequest: CommandSurfaceKnowledgeCapturesResolveState
   }

   export function createInitialKnowledgeCapturesState(): CommandSurfaceKnowledgeCapturesState {
     return {
       knowledge: createInitialDiagnosticsPhaseState<KnowledgeData>(),
       captures: createInitialDiagnosticsPhaseState<CapturesData>(),
       resolveRequest: { pending: false, lastError: null, lastResult: null },
     }
   }
   ```

   Then add `knowledgeCaptures: CommandSurfaceKnowledgeCapturesState` to `WorkspaceCommandSurfaceState` interface (around line 395).

   Add imports at the top: `import type { KnowledgeData, CapturesData, CaptureResolveResult } from "./knowledge-captures-types.ts"`

   Initialize `knowledgeCaptures: createInitialKnowledgeCapturesState()` in both places where `createInitialDiagnosticsState()` is called for the commandSurface state (search for `diagnostics: createInitialDiagnosticsState()` — there are two: the initial state around line 566 and the reset around line 775).

2. **Modify `web/lib/gsd-workspace-store.tsx`** — add load/resolve actions:

   **Imports:** Add at top:
   ```ts
   import type { KnowledgeData, CapturesData, CaptureResolveRequest, CaptureResolveResult } from "./knowledge-captures-types.ts"
   import type { CommandSurfaceKnowledgeCapturesState } from "./command-surface-contract.ts"
   ```
   (The contract import may already be there — just ensure the new type is included.)

   **Private helper** — add after `patchDoctorState()` (around line 2200):
   ```ts
   private patchKnowledgeCapturesState(patch: Partial<CommandSurfaceKnowledgeCapturesState>): void {
     this.patchState({
       commandSurface: {
         ...this.state.commandSurface,
         knowledgeCaptures: { ...this.state.commandSurface.knowledgeCaptures, ...patch },
       },
     })
   }

   private patchKnowledgeCapturesPhaseState<K extends "knowledge" | "captures">(
     key: K,
     patch: Partial<CommandSurfaceDiagnosticsPhaseState<K extends "knowledge" ? KnowledgeData : CapturesData>>,
   ): void {
     this.patchState({
       commandSurface: {
         ...this.state.commandSurface,
         knowledgeCaptures: {
           ...this.state.commandSurface.knowledgeCaptures,
           [key]: { ...this.state.commandSurface.knowledgeCaptures[key], ...patch },
         },
       },
     })
   }
   ```

   **Load methods** — add after `loadSkillHealthDiagnostics` (around line 2290):
   ```ts
   loadKnowledgeData = async (): Promise<KnowledgeData | null> => {
     this.patchKnowledgeCapturesPhaseState("knowledge", { phase: "loading", error: null })
     try {
       const response = await fetch("/api/knowledge", { method: "GET", cache: "no-store", headers: { Accept: "application/json" } })
       const payload = await response.json().catch(() => null)
       if (!response.ok || !payload) {
         const message = payload?.error ?? `Knowledge request failed with ${response.status}`
         this.patchKnowledgeCapturesPhaseState("knowledge", { phase: "error", error: message })
         return null
       }
       this.patchKnowledgeCapturesPhaseState("knowledge", { phase: "loaded", data: payload as KnowledgeData, lastLoadedAt: new Date().toISOString() })
       return payload as KnowledgeData
     } catch (error) {
       const message = normalizeClientError(error)
       this.patchKnowledgeCapturesPhaseState("knowledge", { phase: "error", error: message })
       return null
     }
   }

   loadCapturesData = async (): Promise<CapturesData | null> => {
     this.patchKnowledgeCapturesPhaseState("captures", { phase: "loading", error: null })
     try {
       const response = await fetch("/api/captures", { method: "GET", cache: "no-store", headers: { Accept: "application/json" } })
       const payload = await response.json().catch(() => null)
       if (!response.ok || !payload) {
         const message = payload?.error ?? `Captures request failed with ${response.status}`
         this.patchKnowledgeCapturesPhaseState("captures", { phase: "error", error: message })
         return null
       }
       this.patchKnowledgeCapturesPhaseState("captures", { phase: "loaded", data: payload as CapturesData, lastLoadedAt: new Date().toISOString() })
       return payload as CapturesData
     } catch (error) {
       const message = normalizeClientError(error)
       this.patchKnowledgeCapturesPhaseState("captures", { phase: "error", error: message })
       return null
     }
   }

   resolveCaptureAction = async (request: CaptureResolveRequest): Promise<CaptureResolveResult | null> => {
     this.patchKnowledgeCapturesState({ resolveRequest: { pending: true, lastError: null, lastResult: null } })
     try {
       const response = await fetch("/api/captures", {
         method: "POST",
         cache: "no-store",
         headers: { "Content-Type": "application/json", Accept: "application/json" },
         body: JSON.stringify(request),
       })
       const payload = await response.json().catch(() => null)
       if (!response.ok || !payload) {
         const message = payload?.error ?? `Capture resolve failed with ${response.status}`
         this.patchKnowledgeCapturesState({ resolveRequest: { pending: false, lastError: message, lastResult: null } })
         return null
       }
       const result = payload as CaptureResolveResult
       this.patchKnowledgeCapturesState({ resolveRequest: { pending: false, lastError: null, lastResult: result } })
       // Auto-reload captures after successful resolve
       void this.loadCapturesData()
       return result
     } catch (error) {
       const message = normalizeClientError(error)
       this.patchKnowledgeCapturesState({ resolveRequest: { pending: false, lastError: message, lastResult: null } })
       return null
     }
   }
   ```

   **ActionKey union** — add three entries around line 4670 (find the union that includes `loadForensicsDiagnostics`):
   ```ts
   | "loadKnowledgeData"
   | "loadCapturesData"
   | "resolveCaptureAction"
   ```

   **useGSDWorkspaceActions hook** — add three entries around line 4720 (find the object that includes `loadForensicsDiagnostics: store.loadForensicsDiagnostics`):
   ```ts
   loadKnowledgeData: store.loadKnowledgeData,
   loadCapturesData: store.loadCapturesData,
   resolveCaptureAction: store.resolveCaptureAction,
   ```

3. **Create `web/components/gsd/knowledge-captures-panel.tsx`** — combined panel:

   This is a `"use client"` component. It renders a two-tab layout (Knowledge / Captures). The tab shown depends on which surface section triggered it (prop `initialTab`).

   **Do NOT import from `diagnostics-panels.tsx`** — the shared DiagHeader/DiagError/DiagLoading/DiagEmpty are not exported. Implement lightweight equivalents inline (they're 5-15 lines each).

   Structure:
   - Import from `@/lib/gsd-workspace-store` (useGSDWorkspaceState, useGSDWorkspaceActions)
   - Import types from `@/lib/knowledge-captures-types`
   - Import UI primitives: `Badge` from `@/components/ui/badge`, `Button` from `@/components/ui/button`, icons from `lucide-react`
   - Import `cn` from `@/lib/utils`

   Panel layout:
   ```
   ┌──────────────────────────────────────────────┐
   │  [ Knowledge ] [ Captures (3 pending) ]       │  ← tabs
   ├──────────────────────────────────────────────┤
   │  (active tab content)                         │
   └──────────────────────────────────────────────┘
   ```

   **Knowledge tab:**
   - Shows list of `KnowledgeEntry` items
   - Each entry: heading text, type badge (rule/pattern/lesson/freeform), content preview
   - Empty state: "No knowledge entries found"
   - Loading state: spinner + "Loading knowledge base…"

   **Captures tab:**
   - Shows list of `CaptureEntry` items
   - Each entry: text, timestamp, status badge (pending=amber, triaged=sky, resolved=emerald), classification badge if present
   - For pending entries: row of triage action buttons — one per classification (quick-task, inject, defer, replan, note)
   - Each button calls `resolveCaptureAction({ captureId, classification, resolution: "Manual browser triage", rationale: "Triaged via web UI" })`
   - Show resolve-in-progress state and errors
   - Empty state: "No captures found"
   - Stats bar: total entries, pending count, actionable count

   **Props:**
   ```ts
   interface KnowledgeCapturesPanelProps {
     initialTab: "knowledge" | "captures"
   }
   ```

   Export:
   ```ts
   export function KnowledgeCapturesPanel({ initialTab }: KnowledgeCapturesPanelProps)
   ```

4. **Modify `web/components/gsd/command-surface.tsx`** — wire the panel:

   **Import** at top (near the ForensicsPanel/DoctorPanel/SkillHealthPanel import):
   ```ts
   import { KnowledgeCapturesPanel } from "./knowledge-captures-panel"
   ```

   **useEffect auto-load** — add to the existing diagnostics useEffect block (around line 385). Add conditions for the three sections:
   ```ts
   } else if (
     (commandSurface.section === "gsd-knowledge") &&
     knowledgeCaptures.knowledge.phase === "idle"
   ) {
     void loadKnowledgeData()
     void loadCapturesData()  // pre-load both for tab switching
   } else if (
     (commandSurface.section === "gsd-capture" || commandSurface.section === "gsd-triage") &&
     knowledgeCaptures.captures.phase === "idle"
   ) {
     void loadCapturesData()
     void loadKnowledgeData()  // pre-load both for tab switching
   }
   ```

   Add `knowledgeCaptures` to the useEffect dependency access — destructure from `commandSurface` state like `diagnostics` is. Add `loadKnowledgeData`, `loadCapturesData` to the dependency array and destructure from actions.

   **renderSection switch** — replace the three cases (around line 1939 area, before the `default:` gsd-* placeholder):
   ```ts
   case "gsd-knowledge": return <KnowledgeCapturesPanel initialTab="knowledge" />
   case "gsd-capture": return <KnowledgeCapturesPanel initialTab="captures" />
   case "gsd-triage": return <KnowledgeCapturesPanel initialTab="captures" />
   ```

   These must go BEFORE the `default:` case that renders the generic gsd-* placeholder.

## Must-Haves

- [ ] `CommandSurfaceKnowledgeCapturesState` interface exists in contract with knowledge/captures phase state and resolveRequest state
- [ ] `knowledgeCaptures` field added to `WorkspaceCommandSurfaceState` and initialized in both initial state locations
- [ ] `loadKnowledgeData()`, `loadCapturesData()`, `resolveCaptureAction()` store methods work (fetch + state patch)
- [ ] Three new action keys registered in `ActionKey` union and `useGSDWorkspaceActions` hook
- [ ] `KnowledgeCapturesPanel` component renders two tabs with knowledge entries and capture entries
- [ ] Pending captures show triage action buttons that call `resolveCaptureAction()`
- [ ] `gsd-knowledge` section renders panel with Knowledge tab focused
- [ ] `gsd-capture` and `gsd-triage` sections render panel with Captures tab focused
- [ ] useEffect auto-loads data when sections open (idle → loading)
- [ ] `npm run build` and `npm run build:web-host` succeed
- [ ] `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 118 tests pass

## Verification

- `npm run build` — TypeScript compilation exits 0
- `npm run build:web-host` — Next.js production build exits 0 (verifies component renders without SSR errors)
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — all 118 tests pass (regression check — no dispatch changes)

## Inputs

- `web/lib/knowledge-captures-types.ts` — types created in T01 (`KnowledgeData`, `CapturesData`, `CaptureResolveRequest`, `CaptureResolveResult`)
- `web/app/api/knowledge/route.ts` — GET endpoint created in T01
- `web/app/api/captures/route.ts` — GET + POST endpoints created in T01
- `web/lib/command-surface-contract.ts` — existing contract with `CommandSurfaceDiagnosticsPhaseState<T>` generic, `WorkspaceCommandSurfaceState`, `createInitialDiagnosticsPhaseState()` — modify to add knowledgeCaptures
- `web/lib/gsd-workspace-store.tsx` — existing store with `patchDiagnosticsPhaseState()` pattern and `ActionKey` union — modify to add knowledge/captures actions
- `web/components/gsd/diagnostics-panels.tsx` — reference for UI patterns (DO NOT IMPORT FROM — the shared helpers are not exported; re-implement lightweight equivalents)
- `web/components/gsd/command-surface.tsx` — existing command surface with diagnostics useEffect pattern (line ~385) and renderSection switch (line ~1939) — modify to wire panel

## Expected Output

- `web/lib/command-surface-contract.ts` — modified with `CommandSurfaceKnowledgeCapturesState`, `knowledgeCaptures` in `WorkspaceCommandSurfaceState`
- `web/lib/gsd-workspace-store.tsx` — modified with three new store methods and action key registrations
- `web/components/gsd/knowledge-captures-panel.tsx` — new combined panel component
- `web/components/gsd/command-surface.tsx` — modified with panel wiring and useEffect auto-load
