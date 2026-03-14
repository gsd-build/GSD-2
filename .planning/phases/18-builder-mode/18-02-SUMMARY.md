---
phase: 18-builder-mode
plan: 02
subsystem: ui
tags: [builder-mode, intent-classification, react, bun, anthropic-api]

requires:
  - phase: 18-01
    provides: InterfaceModeContext, useBuilderMode hook, ChatInput builderMode prop
  - phase: 16-oauth-keychain
    provides: auth.json format with provider/api_key fields
  - phase: 17-permission-model
    provides: server.ts route registration pattern

provides:
  - classifyIntent() pure function with fetchFn injection for testability
  - handleClassifyIntentRequest Bun handler for POST /api/classify-intent
  - RoutingBadge component (routing transparency in Builder mode)
  - PhaseGateCard component (UI_PHASE_GATE intercept)
  - AppShell handleBuilderSend: async classify-before-dispatch pipeline

affects:
  - 18-03
  - 18-04

tech-stack:
  added: []
  patterns:
    - "fetchFn injection pattern: classifyIntent(message, state, fetchFn=fetch) for test isolation without module mocking"
    - "_setAuthOverride test helper: module-level override for auth.json, mirrors _setGlobalDir in settings-api.ts"
    - "Fail-open pattern: any classifyIntent error returns GENERAL_CODING, message never dropped"
    - "AbortController 1500ms timeout on classify fetch: fast enough to not degrade UX"

key-files:
  created:
    - packages/mission-control/src/server/classify-intent-api.ts
    - packages/mission-control/src/components/chat/RoutingBadge.tsx
    - packages/mission-control/src/components/chat/PhaseGateCard.tsx
    - packages/mission-control/tests/classify-intent.test.ts
  modified:
    - packages/mission-control/src/server.ts
    - packages/mission-control/src/components/layout/AppShell.tsx
    - packages/mission-control/src/components/layout/SingleColumnView.tsx
    - packages/mission-control/tests/builder-mode.test.ts

key-decisions:
  - "fetchFn injected as default parameter (not module mock) — aligns with project pattern; tests inject mock directly, no need for bun:mock"
  - "_setAuthOverride test helper on classify-intent-api.ts mirrors _setGlobalDir pattern from settings-api.ts for test isolation"
  - "GSD_COMMAND intent maps to '/gsd auto' sentAs — most common builder routing for workflow commands"
  - "RoutingBadge and PhaseGateCard rendered in SingleColumnView chat wrapper (not AppShell overlay) — collocated with chat UI, avoids z-index issues"
  - "isClassifying folds into isChatProcessing — disables ChatInput during classification to prevent double-send"

patterns-established:
  - "Builder mode classify pipeline: useBuilderMode() → handleBuilderSend → /api/classify-intent → route intent"
  - "UI_PHASE_GATE stops message dispatch entirely; PhaseGateCard offers two recovery paths"

requirements-completed:
  - BUILDER-04
  - BUILDER-07

duration: 11min
completed: 2026-03-14
---

# Phase 18 Plan 02: Builder Mode Intent Classifier Summary

**Classify-before-dispatch pipeline for Builder mode: POST /api/classify-intent calls Claude Haiku, routes GSD_COMMAND/PHASE_QUESTION/GENERAL_CODING/UI_PHASE_GATE with RoutingBadge transparency and PhaseGateCard intercept**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-14T11:35:36Z
- **Completed:** 2026-03-14T11:46:53Z
- **Tasks:** 2 (Task 1 TDD: RED + GREEN; Task 2: UI components + wiring)
- **Files modified:** 8

## Accomplishments

- `classifyIntent()` function with OAuth provider skip (anthropic/github-copilot), 1500ms AbortController timeout, fail-open GENERAL_CODING on any error; accepts `fetchFn` injection for test isolation
- `POST /api/classify-intent` registered in server.ts, always returns 200 with `{ intent }` (never 5xx from classifier failure)
- 8 classify-intent tests pass (GSD_COMMAND routing, 400/throw fail-open, OAuth skip without fetch, API call verification, malformed JSON)
- `RoutingBadge` pure component renders "Sent as: [label] · Override · x" banner after message dispatch
- `PhaseGateCard` pure component renders "One step first" intercept with Set up design / Skip paths
- `handleBuilderSend` in AppShell: classifies, routes UI_PHASE_GATE to PhaseGateCard, shows RoutingBadge for all other intents, feeds `isClassifying` into `isChatProcessing`

## Task Commits

1. **TDD RED — classify-intent failing tests** - `445e4f6` (test)
2. **Task 1 GREEN — classifyIntent + route** - `c51604e` (feat)
3. **Task 2 — RoutingBadge + PhaseGateCard + AppShell wiring** - `41e42b4` (feat)

## Files Created/Modified

- `packages/mission-control/src/server/classify-intent-api.ts` - classifyIntent(), handleClassifyIntentRequest, _setAuthOverride test helper, INTENT_SYSTEM_PROMPT
- `packages/mission-control/src/server.ts` - /api/classify-intent route registered after trust routes
- `packages/mission-control/src/components/chat/RoutingBadge.tsx` - Routing transparency banner (GSD_COMMAND/PHASE_QUESTION/GENERAL_CODING)
- `packages/mission-control/src/components/chat/PhaseGateCard.tsx` - UI_PHASE_GATE intercept card with two paths
- `packages/mission-control/src/components/layout/AppShell.tsx` - handleBuilderSend + routing state (routingBadgeState, phaseGateState, isClassifying)
- `packages/mission-control/src/components/layout/SingleColumnView.tsx` - threads routing props, renders PhaseGateCard above chat + RoutingBadge below input
- `packages/mission-control/tests/classify-intent.test.ts` - 8 TDD tests
- `packages/mission-control/tests/builder-mode.test.ts` - MISSING stub replaced with import verification test

## Decisions Made

- `fetchFn` injected as optional default parameter rather than using module-level mocking — consistent with project test pattern, enables direct function testing without bun:mock
- `_setAuthOverride` helper mirrors `_setGlobalDir` from settings-api.ts — established test isolation pattern for server modules
- `GSD_COMMAND` intent maps `sentAs` to `/gsd auto` — auto mode is the correct GSD 2 workflow command for "build something"
- `RoutingBadge` and `PhaseGateCard` rendered inside SingleColumnView chat wrapper div (not AppShell absolute overlay) — collocated with chat UI, no z-index conflicts
- `isClassifying` folds into `isChatProcessing` prop to disable ChatInput during the 1500ms classify window

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — 8 classify-intent tests GREEN on first GREEN attempt, no regressions in 747 suite (2 pre-existing failures: latency timing and server startup timeout, both unrelated to this plan).

## User Setup Required

None — no external service configuration required. The classifier uses existing ~/.gsd/auth.json credentials.

## Next Phase Readiness

- Intent classifier pipeline fully functional: POST /api/classify-intent, handleBuilderSend, RoutingBadge, PhaseGateCard
- BUILDER-04 and BUILDER-07 requirements satisfied
- Phase 18-03 can now build on the routing infrastructure

---
*Phase: 18-builder-mode*
*Completed: 2026-03-14*
