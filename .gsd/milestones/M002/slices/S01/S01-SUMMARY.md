---
id: S01
parent: M002
milestone: M002
provides:
  - Authoritative browser slash-command dispatch that blocks known built-in fallthrough while preserving GSD extension commands
  - Shared browser command surface and RPC-backed daily controls for model, thinking, auth, session, resume, fork, export, and compact flows
  - Contract and integration proof that typed and clicked browser controls now execute, open a surface, or reject clearly
requires: []
affects:
  - S02
  - S03
key_files:
  - web/lib/browser-slash-command-dispatch.ts
  - web/lib/command-surface-contract.ts
  - web/lib/gsd-workspace-store.tsx
  - web/components/gsd/terminal.tsx
  - web/components/gsd/command-surface.tsx
  - web/components/gsd/sidebar.tsx
  - web/components/gsd/dashboard.tsx
  - src/web/onboarding-service.ts
  - web/app/api/onboarding/route.ts
  - src/tests/web-command-parity-contract.test.ts
  - src/tests/web-live-interaction-contract.test.ts
  - src/tests/integration/web-mode-assembled.test.ts
key_decisions:
  - Browser built-ins resolve through one authoritative dispatcher with explicit rpc, surface, local, or reject outcomes; only non-built-in slash input stays on the prompt or extension path.
  - Typed slash commands and clicked browser affordances reuse one shared command-surface and store-action contract so click and slash behavior cannot drift.
  - Browser logout only mutates auth-file credentials and must fail clearly for environment or runtime-backed auth that the browser cannot remove.
  - Session-oriented browser controls (/resume, /fork, /session, /export, /compact) share one inspectable surface state and action path.
patterns_established:
  - Daily-use browser slash commands now map to execute, open-surface, local-handle, or reject semantics instead of transcript fallthrough.
  - Surface-backed mutations report busy, error, and result state through one command-surface object while refreshing boot and session state through the same store boundary.
observability_surfaces:
  - workspace store `lastSlashCommandOutcome` plus `commandSurface` (`section`, `pendingAction`, `selectedTarget`, `lastError`, `lastResult`, `availableModels`, `forkMessages`, `sessionStats`, `lastCompaction`)
  - browser markers `[data-testid="command-surface"]`, `command-surface-kind`, `command-surface-session`, `command-surface-resume`, `command-surface-fork`, `command-surface-compact`, `command-surface-error`, and `command-surface-result`
  - `/api/session/command` responses for model, thinking, session, fork, export, and compact actions plus `/api/onboarding` auth mutation and bridge-refresh state
  - terminal system or error lines for reserved and rejected built-ins
drill_down_paths:
  - .gsd/milestones/M002/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M002/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M002/slices/S01/tasks/T03-SUMMARY.md
duration: 3h27m
verification_result: passed
completed_at: 2026-03-15T05:39:09-04:00
---

# S01: Safe slash-command dispatch and RPC-backed daily controls

**Shipped safe browser slash-command dispatch plus real browser-native daily controls so known built-ins no longer fall through to the model and GSD extension commands still route through the supported prompt path.**

## What Happened

S01 closed the highest-risk M002 gap first: the browser terminal no longer treats known built-in slash commands as plain prompt text. I added an authoritative browser dispatcher derived from `packages/pi-coding-agent/src/core/slash-commands.ts` that classifies each known built-in as `rpc`, `surface`, `local`, or `reject`, and leaves only non-built-in slash input on the prompt or extension path.

That dispatcher now sits at the shared store submit boundary in `web/lib/gsd-workspace-store.tsx`, so typed browser input, dashboard buttons, and sidebar affordances all reuse the same command routing contract. Built-ins such as `/new` execute through RPC, browser-local helpers like `/clear` and `/refresh` stay local, daily-use browser controls open a real command surface, and deferred built-ins like `/share` reject with explicit browser-visible guidance instead of silently becoming transcript text.

I introduced a shared browser command surface contract and UI so the daily-use built-ins in scope have real browser-native outcomes. `/settings`, `/model`, `/thinking`, `/login`, and `/logout` now share one inspectable surface backed by real RPC or onboarding actions. Model and thinking changes call `get_available_models`, `set_model`, and `set_thinking_level`; auth mutations route through the onboarding service and `/api/onboarding`, with explicit failure semantics when browser logout cannot clear environment-backed auth.

I then completed the remaining session-oriented controls in the slice. `/resume`, `/fork`, `/session`, `/export`, and `/compact` now reuse the same shared command-surface/store-action path and real RPC commands (`switch_session`, `get_fork_messages`, `fork`, `get_session_stats`, `export_html`, `compact`). Dashboard session affordances were rewired onto those same actions so typed and clicked flows stay aligned.

The proof coverage now matches the shipped contract. `src/tests/web-command-parity-contract.test.ts` proves the no-fallthrough invariant, explicit reject semantics for deferred built-ins, surface targeting for the new browser controls, and preservation of representative GSD-specific commands like `/gsd status`, `/worktree list`, `/wt list`, `/kill`, and `/exit`. Route-level and assembled integration tests prove the browser session/auth/model actions round-trip through the real web routes and that built-ins now execute, open a surface, or reject while GSD commands remain on the supported extension-command path.

## Verification

Passed the slice-plan verification set:

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-command-parity-contract.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-onboarding-contract.test.ts src/tests/web-live-interaction-contract.test.ts src/tests/integration/web-mode-assembled.test.ts`
- `npm run build:web-host`

Confirmed the slice observability surfaces against a live staged host at `http://localhost:3010`:

- typed `/session` in the browser terminal and verified `[data-testid="command-surface"]`, `[data-testid="command-surface-session"]`, and `[data-testid="command-surface-kind"]` rendered the shared session surface
- typed `/share` and verified the browser showed the explicit terminal reject guidance instead of sending the built-in to the model
- queried `GET /api/onboarding` and confirmed inspectable onboarding and bridge-auth refresh state remained available through the live route contract

## Requirements Advanced

- R011 — S01 retired the unsafe built-in fallthrough path and delivered real browser-native outcomes for the daily-use built-ins in scope, giving M002 a concrete parity foundation instead of a provisional roadmap placeholder.

## Requirements Validated

- None. R011 remains active until S02-S04 finish the broader current-project parity surfaces, live freshness and recovery diagnostics, and real runtime hardening proof.

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- R011 — ownership was refined from provisional M002-only tracking to concrete M002/S01 primary ownership with S02-S04 as supporting slices.

## Deviations

- Added explicit browser-local coverage for `/new-session` alongside `/clear`, `/refresh`, and `/state` so legacy helpers stayed safe under the same dispatcher contract.
- Added `web/lib/command-surface-contract.ts` as a pure state seam so the shared browser surface behavior could be tested without importing React or TSX into the Node test runner.

## Known Limitations

- S02 still needs to finish the broader current-project parity surfaces around session browsing and settings/auth management beyond the daily-use controls shipped here.
- S03 still needs targeted live freshness and browser-visible recovery diagnostics so these new surfaces stay current without relying on boot polling.
- S04 still carries the full real `gsd --web` assembled runtime proof for refresh, reopen, and interrupted-run scenarios.

## Follow-ups

- Add narrower browser-level test hooks around terminal notice rows if later slices need less noisy live-browser assertions than broad body-text checks.
- Keep future parity work on the shared dispatcher and command-surface/store-action seams instead of introducing new click-only or slash-only paths.

## Files Created/Modified

- `web/lib/browser-slash-command-dispatch.ts` — authoritative browser slash-command classifier and reserved or rejected built-in messaging
- `web/lib/command-surface-contract.ts` — pure state contract for the shared browser command surface
- `web/lib/gsd-workspace-store.tsx` — shared submit boundary, slash outcome tracking, command-surface state, and RPC-backed daily actions
- `web/components/gsd/terminal.tsx` — terminal submit path now routes through the shared store boundary instead of direct prompt fallthrough
- `web/components/gsd/command-surface.tsx` — real browser UI for model, thinking, auth, resume, fork, session, export, and compact controls
- `web/components/gsd/sidebar.tsx` — sidebar Settings button now opens the shared command surface
- `web/components/gsd/dashboard.tsx` — dashboard session affordances now reuse the shared slash or session action path
- `src/web/web-auth-storage.ts` — browser logout support for persisted auth-file credentials
- `src/web/onboarding-service.ts` — inspectable auth login/logout orchestration and bridge-auth refresh handling
- `web/app/api/onboarding/route.ts` — logout mutation route support for browser auth flows
- `src/tests/web-command-parity-contract.test.ts` — explicit command outcome, reject, surface, and GSD command preservation coverage
- `src/tests/web-live-interaction-contract.test.ts` — route-level proof for session, fork, export, and compact browser RPC flows
- `src/tests/integration/web-mode-assembled.test.ts` — assembled slash-behavior proof for execute, surface, reject, and preserved extension-command routing
- `.gsd/REQUIREMENTS.md` — refined active requirement ownership and coverage mapping for R011

## Forward Intelligence

### What the next slice should know
- The shared command surface already owns the daily-use built-ins from S01. Extend that state and action graph for new browser-native parity surfaces instead of opening alternate panels or inventing a second command dispatcher.

### What's fragile
- Broad whole-page browser `text_visible` assertions are noisy against the dense dashboard shell. Prefer `data-testid` selectors, route payloads, or scoped terminal markers when verifying future browser-visible messages.

### Authoritative diagnostics
- Start with `web/lib/gsd-workspace-store.tsx` (`lastSlashCommandOutcome` and `commandSurface`) plus `src/tests/web-command-parity-contract.test.ts`. Those are the fastest trustworthy signals for whether a browser command was routed, rejected, or surfaced correctly.

### What assumptions changed
- The slice could not stop at a safe dispatcher alone. To satisfy the slice demo and keep visible browser controls from becoming inert, S01 also had to ship the real shared browser command surface and the first RPC-backed/auth-backed parity actions.
