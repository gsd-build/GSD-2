---
id: T01
parent: S01
milestone: M002
provides:
  - Authoritative browser slash-command dispatcher with explicit rpc/surface/local/reject outcomes derived from slash-commands.ts
  - Store-level terminal input boundary that records slash dispatch outcomes and blocks built-in fallthrough
  - Contract coverage for built-in no-fallthrough plus GSD slash-command preservation
key_files:
  - web/lib/browser-slash-command-dispatch.ts
  - web/lib/gsd-workspace-store.tsx
  - web/components/gsd/terminal.tsx
  - src/tests/web-command-parity-contract.test.ts
key_decisions:
  - Route typed browser input through a shared pure dispatcher and let unsupported built-ins reject instead of silently hitting the prompt path
patterns_established:
  - Built-in browser commands resolve to rpc, surface, local, or reject; only non-built-in slash input stays on the prompt/extension path
observability_surfaces:
  - workspace store lastSlashCommandOutcome plus browser-visible terminal system/error lines for reserved or rejected slash commands
duration: 56m
verification_result: passed
completed_at: 2026-03-15T04:22:03-04:00
blocker_discovered: false
---

# T01: Extract the authoritative browser slash-command dispatcher and no-fallthrough contract

**Shipped a pure browser slash-command dispatcher, routed typed terminal input through it, and proved built-ins cannot fall through while GSD slash commands still pass through intact.**

## What Happened

I added `web/lib/browser-slash-command-dispatch.ts` as the authoritative browser-side classifier for slash input. It imports `BUILTIN_SLASH_COMMANDS` from `packages/pi-coding-agent/src/core/slash-commands.ts`, maps S01-supported commands to explicit `rpc`, `surface`, or `local` outcomes, and defaults every other known built-in to an explicit `reject` so future core built-ins cannot silently fall through to model text.

In `web/lib/gsd-workspace-store.tsx` I added a store-level `submitInput()` boundary that records `lastSlashCommandOutcome`, routes only safe `prompt`/`rpc` outcomes into `sendCommand()`, keeps `/clear` and `/refresh` local, and appends browser-visible terminal lines for `surface` and `reject` outcomes. I also hardened `buildPromptCommand()` so it now throws if a caller tries to serialize a built-in that the dispatcher classified as `surface`, `local`, or `reject`.

In `web/components/gsd/terminal.tsx` I removed the old `/clear` and `/refresh` special-casing plus the direct `buildPromptCommand()` submit path, and switched the typed terminal flow to the shared `submitInput()` boundary.

Finally, I added `src/tests/web-command-parity-contract.test.ts` to prove two invariants: every authoritative built-in from `slash-commands.ts` resolves to an explicit non-prompt outcome, and the current GSD slash-command family (`/gsd`, `/worktree`, `/wt`, `/kill`, `/exit`, including named samples like `/gsd status` and `/worktree list`) stays on the prompt/extension path instead of being swallowed or rejected.

## Verification

- Passed parity contract:
  - `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-command-parity-contract.test.ts`
- Passed slice verification checks already present for adjacent contracts:
  - `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-onboarding-contract.test.ts src/tests/web-live-interaction-contract.test.ts src/tests/integration/web-mode-assembled.test.ts`
  - `npm run build:web-host`
- Exercised the real browser flow against `http://localhost:3000`:
  - submitted `/share` and explicitly verified the terminal showed the reject guidance (`blocked instead of falling through to the model`) with no console or failed-network errors
  - submitted `/model` and explicitly verified the terminal showed the reserved-surface message (`reserved for browser-native handling and was not sent to the model`) with no console or failed-network errors

## Diagnostics

- Inspect dispatcher behavior directly in `web/lib/browser-slash-command-dispatch.ts` and `src/tests/web-command-parity-contract.test.ts`
- Inspect the last classified slash outcome in `web/lib/gsd-workspace-store.tsx` via `lastSlashCommandOutcome`
- Inspect browser-visible failure/safety messaging in terminal lines after submitting deferred built-ins like `/share` or reserved surface commands like `/model`

## Deviations

- Added explicit browser-local coverage for legacy helpers `/clear` and `/new-session` in addition to the task-plan minimum set so the existing terminal affordances stayed safe and inspectable under the same dispatcher contract

## Known Issues

- Surface-classified commands such as `/model`, `/thinking`, `/resume`, `/fork`, `/compact`, `/login`, `/logout`, `/settings`, `/session`, and `/export` currently emit a browser-visible reserved-surface message; T02/T03 still need to replace those placeholders with real browser surfaces and RPC-backed flows

## Files Created/Modified

- `web/lib/browser-slash-command-dispatch.ts` — pure authoritative browser slash-command dispatcher and terminal notice formatter
- `web/lib/gsd-workspace-store.tsx` — store-level `submitInput()` boundary, explicit last-outcome observability, and hardened prompt builder
- `web/components/gsd/terminal.tsx` — typed submit flow now routes through the shared dispatcher boundary
- `src/tests/web-command-parity-contract.test.ts` — no-fallthrough and GSD-command preservation contract coverage
