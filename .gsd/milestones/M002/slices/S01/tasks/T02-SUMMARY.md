---
id: T02
parent: S01
milestone: M002
provides:
  - Shared browser command surface for settings, model, thinking, and auth controls with inspectable busy/error/result state
  - Real RPC-backed model and thinking mutations reused by slash input and clicked settings entry
  - Logout-capable onboarding/auth browser contract with explicit failure handling for non-file-backed auth
key_files:
  - web/components/gsd/command-surface.tsx
  - web/lib/command-surface-contract.ts
  - web/lib/gsd-workspace-store.tsx
  - src/web/onboarding-service.ts
  - web/app/api/onboarding/route.ts
key_decisions:
  - Browser logout only removes auth-file credentials and fails explicitly for environment/runtime-backed auth that the browser cannot clear
patterns_established:
  - Typed slash commands and clicked controls open the same shared browser surface while mutations report through one command-surface state object
  - Surface-backed model and thinking actions use silent RPC commands plus explicit store-level result/error state instead of terminal-only feedback
observability_surfaces:
  - workspace store commandSurface state plus data-testid-tagged command-surface markers and /api/onboarding auth mutation responses
duration: 31m
verification_result: passed
completed_at: 2026-03-15T04:53:38-04:00
blocker_discovered: false
---

# T02: Build the real browser surfaces for model, thinking, settings, and auth controls

**Shipped a real shared browser command surface for settings/model/thinking/auth, backed it with RPC and onboarding mutations, and made the sidebar Settings control reuse the same path as slash input.**

## What Happened

I added `web/components/gsd/command-surface.tsx` and the pure state contract in `web/lib/command-surface-contract.ts` so browser-native controls now have one inspectable sheet with active section, selected target, pending action, last error, and last result state.

In `web/lib/gsd-workspace-store.tsx` I wired `/settings`, `/model`, `/thinking`, `/login`, and `/logout` into that shared surface. Typed slash input now opens the real sheet for the implemented browser surfaces instead of only printing the reserved-surface notice. The same store exports power the sidebar Settings button, section switching, target selection, model loading, model application, thinking changes, and auth actions.

For model and thinking controls, the sheet now uses real RPC-backed commands: `get_available_models` to populate choices, `set_model` to apply the selected model, and `set_thinking_level` to apply thinking changes. These mutations update surface result/error state directly and keep the live bridge/session snapshot in sync.

For auth, I extended `src/web/web-auth-storage.ts`, `src/web/onboarding-service.ts`, and `web/app/api/onboarding/route.ts` with real logout support. Browser logout removes persisted auth-file credentials, refreshes bridge auth, and fails clearly when the provider is only configured via environment/runtime auth that browser mode cannot unset. Login/start-flow and API-key setup now have surface wrappers that expose success/failure through the shared command-surface state while still reusing the existing onboarding service and bridge-refresh contract.

Finally, I made the sidebar Settings affordance real by routing it to the same `openCommandSurface("settings")` store action that slash input uses, and expanded the contract tests to prove the shared opening contract plus model/auth failure visibility.

## Verification

Re-ran the task-local verification on retry and it passed:
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-command-parity-contract.test.ts src/tests/web-onboarding-contract.test.ts`

Re-ran the broader slice checks exercised during T02 and they passed:
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-onboarding-contract.test.ts src/tests/web-live-interaction-contract.test.ts src/tests/integration/web-mode-assembled.test.ts`
- `npm run build:web-host`

Exercised the real browser flow against the local standalone host at `http://localhost:3010` with explicit checks:
- clicked the sidebar Settings button and verified `[data-testid="command-surface"]`, `[data-testid="command-surface-kind"]`, and `[data-testid="command-surface-models"]` opened together with no console or failed-network errors
- closed the sheet, submitted `/model` through `[data-testid="terminal-command-input"]`, and explicitly verified the same shared surface reopened on the model section with the `/model` badge and no console or failed-network errors
- queried the live DOM and confirmed the surface title/kind resolved to `Model` + `/model`, while `GET /api/onboarding` returned inspectable auth-refresh state (`bridgeAuthRefresh.phase: "idle"`, `locked: false`)

## Diagnostics

- Inspect shared surface state in `web/lib/gsd-workspace-store.tsx` via `commandSurface` (`activeSurface`, `section`, `pendingAction`, `selectedTarget`, `lastError`, `lastResult`, `availableModels`)
- Inspect the rendered browser surface via `data-testid="command-surface"`, `command-surface-kind`, `command-surface-error`, `command-surface-result`, and the section-specific markers
- Inspect auth mutation and bridge-refresh state through `GET/POST /api/onboarding`
- Inspect the shared opening contract in `web/lib/command-surface-contract.ts` and the parity coverage in `src/tests/web-command-parity-contract.test.ts`

## Deviations

- Added `web/lib/command-surface-contract.ts` as a pure TS seam for state transitions and contract tests so the browser sheet behavior could be proven without importing React/TSX into the Node test runner

## Known Issues

- `/resume`, `/fork`, `/compact`, `/session`, and `/export` still rely on the reserved-surface path from T01; T03 still needs to make those browser surfaces real

## Files Created/Modified

- `web/components/gsd/command-surface.tsx` — new shared browser sheet for settings/model/thinking/auth controls
- `web/lib/command-surface-contract.ts` — pure command-surface state contract used by the store and parity tests
- `web/lib/gsd-workspace-store.tsx` — command-surface state/actions, silent RPC-backed model/thinking mutations, and logout surface wrappers
- `web/components/gsd/app-shell.tsx` — composed the shared command surface into the real app shell
- `web/components/gsd/sidebar.tsx` — made the visible Settings affordance open the shared command surface
- `src/web/web-auth-storage.ts` — added logout support to the browser auth storage contract
- `src/web/onboarding-service.ts` — implemented logout orchestration with explicit non-file-auth failure handling and bridge-auth refresh
- `web/app/api/onboarding/route.ts` — added the `logout_provider` onboarding action
- `src/tests/web-command-parity-contract.test.ts` — added shared-surface opening and model failure visibility coverage
- `src/tests/web-onboarding-contract.test.ts` — added logout success and failure contract coverage
