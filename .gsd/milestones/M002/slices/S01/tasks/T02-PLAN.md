---
estimated_steps: 5
estimated_files: 8
---

# T02: Build the real browser surfaces for model, thinking, settings, and auth controls

**Slice:** S01 — Safe slash-command dispatch and RPC-backed daily controls
**Milestone:** M002

## Description

After T01, built-ins are classified safely, but `/model`, `/thinking`, `/settings`, `/login`, and `/logout` still need real browser-native outcomes. This task adds a shared browser command surface and the store/API hooks behind it so typed slash commands and clicked controls open the same UI, execute the same mutations, and expose the same success/failure state.

## Steps

1. Add a reusable browser command surface component (for example a sheet/panel) and store state describing the active surface, pending action, selected target, and last surface error/result.
2. Wire `/model` and `/thinking` to that surface. Use real RPC-backed actions: `get_available_models` to populate choices, `set_model` to apply model changes, and `set_thinking_level` to apply thinking changes.
3. Wire `/settings` to the same surface as the browser entry point for these controls so the slice has a named browser-native home for model/thinking/auth management.
4. Extend the browser auth contract as needed so `/login` and `/logout` are real browser actions: start provider auth from the existing onboarding service and add logout support with bridge-auth refresh plus inspectable failure state. Use the same surface for slash-command and click entry.
5. Make an existing visible affordance real — the sidebar Settings button must open this same surface — and add/update tests proving typed and clicked flows share one contract.

## Must-Haves

- [ ] Shared command surface exists in the real app shell
- [ ] `/model` and `/thinking` use real RPC-backed data/actions
- [ ] `/settings` opens the same surface used by the other controls
- [ ] `/login` and `/logout` are real browser actions with inspectable auth-refresh state
- [ ] Sidebar settings affordance is no longer inert and reuses the slash-command path
- [ ] Tests cover success and failure visibility for the new surface actions

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-command-parity-contract.test.ts src/tests/web-onboarding-contract.test.ts`
- Assertions prove the same surface opens from slash input and sidebar click, and that auth/model failures remain inspectable

## Observability Impact

- Signals added/changed: active command-surface kind/state, per-surface busy/error/result state, logout/auth-refresh status surfaced through onboarding state
- How a future agent inspects this: check command-surface store fields, `data-testid` markers on the rendered surface, and `/api/onboarding` responses for auth mutation state
- Failure state exposed: failed model/thinking/auth changes are visible as surface errors instead of silent terminal ambiguity

## Inputs

- T01 output — dispatcher with explicit `surface` outcomes and no-fallthrough guarantees
- `web/lib/gsd-workspace-store.tsx` — current store state/actions and onboarding mutation helpers
- `web/components/gsd/app-shell.tsx`, `web/components/gsd/sidebar.tsx` — shell composition and currently inert Settings button
- `src/web/web-auth-storage.ts`, `src/web/onboarding-service.ts`, `web/app/api/onboarding/route.ts` — current browser auth entry points and refresh behavior

## Expected Output

- `web/components/gsd/command-surface.tsx` — shared browser command surface for settings/model/thinking/auth
- `web/components/gsd/app-shell.tsx` — command surface composed into the shell
- `web/components/gsd/sidebar.tsx` — settings affordance wired to the shared surface
- `web/lib/gsd-workspace-store.tsx` — surface state plus model/thinking/auth actions
- `src/web/web-auth-storage.ts`, `src/web/onboarding-service.ts`, `web/app/api/onboarding/route.ts` — logout-capable browser auth contract with bridge refresh
- `src/tests/web-command-parity-contract.test.ts`, `src/tests/web-onboarding-contract.test.ts` — coverage for surface opening, mutation success, and failure visibility
