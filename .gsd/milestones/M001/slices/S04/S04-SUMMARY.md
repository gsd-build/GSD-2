---
id: S04
parent: M001
milestone: M001
provides:
  - Real current-project view models for dashboard, roadmap, files, activity, status, and power surfaces backed by live boot/session/workspace state instead of placeholder data
requires:
  - slice: S01
    provides: Current-project boot payload, live bridge routes, and shared workspace store boot state
  - slice: S03
    provides: Live transcript, tool execution, status/widget state, and focused interaction events
affects:
  - S05
  - S06
  - S07
key_files:
  - web/lib/workspace-status.ts
  - web/app/api/files/route.ts
  - web/components/gsd/dashboard.tsx
  - web/components/gsd/roadmap.tsx
  - web/components/gsd/files-view.tsx
  - web/components/gsd/activity-view.tsx
  - web/components/gsd/status-bar.tsx
  - web/components/gsd/dual-terminal.tsx
  - src/tests/web-state-surfaces-contract.test.ts
key_decisions:
  - D002
patterns_established:
  - Shared workspace-status derivation layer maps boot/workspace/session state into display-ready view models consumed by multiple preserved-skin surfaces
  - Same-origin files route feeds the files surface with real project data instead of bundled sample rows
  - Mock-free invariant enforced by a dedicated contract test so integrated views cannot drift back to mixed placeholder/live content
observability_surfaces:
  - src/tests/web-state-surfaces-contract.test.ts
  - data-testid="sidebar-current-scope"
  - data-testid="status-bar-unit"
  - dashboard, roadmap, files, and activity surface assertions exercised in the state-surface regression
requirement_outcomes:
  - id: R005
    from_status: active
    to_status: validated
    proof: src/tests/web-state-surfaces-contract.test.ts plus the broader web regression/build proof showed the preserved skin is wired to live GSD data and actions instead of mock content
  - id: R008
    from_status: active
    to_status: validated
    proof: src/tests/web-state-surfaces-contract.test.ts explicitly enforced the mock-free invariant across integrated workspace surfaces and stayed green in the final S07 regression rerun
duration: ~half working day
verification_result: passed
completed_at: 2026-03-15
---

# S04: Current-project state surfaces

**Dashboard, roadmap, files, activity, and status/power surfaces now render live current-project GSD state instead of placeholder shell data.**

## What Happened

S04 turned the preserved `web/` skin from a partially live shell into a real current-project workspace. The slice established `web/lib/workspace-status.ts` as the normalization seam between raw boot/workspace/session state and the view-models the existing UI actually needs. That let the dashboard, roadmap, files, activity, status bar, and power-oriented terminal surfaces consume the same current-project truth instead of each component carrying its own fallback placeholders.

The dashboard now reflects real current-project scope and live workspace context rather than static sample metrics. The roadmap surface reads the actual active milestone/slice/task structure from the current project instead of a canned progress story. The files view moved onto a same-origin files route so it can browse real project files instead of bundled demo rows. The activity view, status bar, and dual-terminal/power surfaces now consume live transcript, session, and status state from the shared store and bridge events rather than mock session strings.

To keep the UI trustworthy once these surfaces were declared integrated, the slice added a dedicated regression guardrail: `src/tests/web-state-surfaces-contract.test.ts`. That contract asserts the key preserved-skin surfaces are backed by live state, that scope/status labels line up with the real boot payload, and that mock placeholder content does not creep back into the integrated views.

## Verification

Passed:
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-state-surfaces-contract.test.ts` — 17/17 pass
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-bridge-contract.test.ts src/tests/web-onboarding-contract.test.ts src/tests/web-live-interaction-contract.test.ts src/tests/web-continuity-contract.test.ts src/tests/web-workflow-controls-contract.test.ts src/tests/web-mode-cli.test.ts` — 59/59 pass with the state-surface contract included in the final milestone regression loop
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/integration/web-mode-assembled.test.ts src/tests/integration/web-mode-runtime.test.ts src/tests/integration/web-mode-onboarding.test.ts` — 5/5 pass, confirming the live host/browser path still renders the integrated surfaces correctly
- `npm run build:web-host` — standalone web host builds cleanly with the live state surfaces wired in

## Requirements Advanced

- R004 — Real current-project surfaces gave the browser workflow the state context needed for start/resume, live interaction, and full assembled browser execution.
- R009 — Shared derived view-models and removal of placeholder seams reduced UI drift and unnecessary rework across surfaces, supporting the snappy local browser path.

## Requirements Validated

- R005 — The preserved dashboard, roadmap, files, activity, terminal/status, and power surfaces are now backed by real GSD state/actions rather than a mock shell, proven by `src/tests/web-state-surfaces-contract.test.ts`, the broader regression rerun, and the packaged runtime/browser proofs.
- R008 — The dedicated state-surface contract now enforces the mock-free invariant directly, preventing integrated views from silently mixing placeholder and live content.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Known Limitations

- This slice closed the core integrated surfaces, not every long-tail browser parity feature. Lower-frequency TUI parity work remains for M002.
- Deep historical analytics remain deferred; the activity surface is intentionally focused on live/current-project state for M001.

## Follow-ups

- S05 should consume the now-live phase/scope/session surfaces to expose visible start/resume workflow controls.
- S06 should add stronger continuity/recovery affordances on top of these live surfaces.
- S07 should keep `src/tests/web-state-surfaces-contract.test.ts` in the assembled regression suite as the guardrail against mock/live drift.

## Files Created/Modified

- `web/lib/workspace-status.ts` — derived current-project state into display-ready labels/cards/status models shared by multiple surfaces
- `web/app/api/files/route.ts` — exposed a same-origin files surface for the preserved browser UI
- `web/components/gsd/dashboard.tsx` — replaced placeholder dashboard state with live current-project/workspace data
- `web/components/gsd/roadmap.tsx` — rendered the real milestone/slice/task structure and active scope
- `web/components/gsd/files-view.tsx` — switched the files surface from sample data to real project file data
- `web/components/gsd/activity-view.tsx` — wired activity output to live session/transcript context
- `web/components/gsd/status-bar.tsx` — rendered live unit/scope/status values from the shared workspace state
- `web/components/gsd/dual-terminal.tsx` — consumed the integrated state surfaces needed for the power view
- `src/tests/web-state-surfaces-contract.test.ts` — added the mock-free/live-surface contract regression for the integrated web workspace

## Forward Intelligence

### What the next slice should know
- `web/lib/workspace-status.ts` is the seam to extend when new preserved-skin surfaces need project/session/workspace view models; do not scatter one-off derivations across components.
- `src/tests/web-state-surfaces-contract.test.ts` is the trust boundary for the integrated skin. Keep it in any future regression suite whenever surface wiring changes.

### What's fragile
- The files and state surfaces now depend on the current-project boot/workspace contracts staying shape-stable — if those contracts drift, multiple UI surfaces regress at once.

### Authoritative diagnostics
- `src/tests/web-state-surfaces-contract.test.ts` — fastest proof that dashboard/roadmap/files/activity/status surfaces are still live and mock-free.
- `data-testid="sidebar-current-scope"` and `data-testid="status-bar-unit"` — quickest runtime signals that the browser is attached to the correct current-project scope.

### What assumptions changed
- The preserved skin was not “mostly good enough” with mixed placeholder/live data — once the browser path became real, a dedicated mock-free contract became necessary to keep the UI trustworthy.
