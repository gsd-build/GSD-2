# S01: Safe slash-command dispatch and RPC-backed daily controls

**Goal:** Retire the unsafe browser slash-command fallthrough path by making known built-ins dispatch through one authoritative browser handler that either executes a real RPC-backed action, opens a real browser surface, handles the command locally, or rejects clearly in-browser — while preserving support for GSD-specific slash commands.
**Demo:** A browser user can type or click daily-use built-ins like `/model`, `/thinking`, `/resume`, `/fork`, `/compact`, `/login`, and `/logout` and see real execution, a real browser surface, or a clear rejection instead of model fallthrough, and GSD-specific commands like `/gsd ...`, `/worktree ...`, `/wt ...`, `/kill`, and `/exit` still route through the supported slash-command path.

R011 is the only Active requirement carried by M002, and this slice attacks its highest-risk gap first. The work is grouped in the order that de-risks the milestone fastest: first make built-in dispatch explicit and testable without regressing GSD extension commands, then wire the real browser surfaces for settings/auth/model controls, then finish the remaining daily-use session controls and prove the typed/clicked command path works as one connected browser contract.

## Must-Haves

- Known built-in slash commands in web mode dispatch through an authoritative browser registry derived from `packages/pi-coding-agent/src/core/slash-commands.ts`; none of those built-ins fall through to `prompt`/`follow_up` model text
- Daily-use built-ins needed for browser parity — `/model`, `/thinking`, `/resume`, `/fork`, `/compact`, `/login`, `/logout`, plus `/settings`, `/session`, and `/export` where they support those flows — execute a real RPC-backed action, open a real browser surface, or reject clearly with browser-visible guidance
- All GSD-specific slash commands registered by the current GSD extension family remain supported after the dispatcher lands; the dispatcher must preserve that whole extension-command path rather than rejecting or rewriting those commands as built-ins, with explicit named coverage for `/gsd`, `/worktree`, `/wt`, `/kill`, and `/exit`
- The same dispatch/result contract is reused by terminal input and visible click affordances so no daily-use browser control introduced by this slice is inert or semantically divergent
- Deferred or unsupported known built-ins reject explicitly in browser-visible state instead of silently becoming transcript text
- Contract and integration proof show command dispatch, browser-surface opening, GSD-command preservation, rejection semantics, and auth/session failure visibility without overclaiming full live-runtime hardening ahead of S04

## Proof Level

- This slice proves: contract + integration
- Real runtime required: no (route/store/browser-surface contracts plus build proof; S04 carries the real `gsd --web` runtime assembly proof)
- Human/UAT required: no

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-command-parity-contract.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-onboarding-contract.test.ts src/tests/web-live-interaction-contract.test.ts src/tests/integration/web-mode-assembled.test.ts`
- `npm run build:web-host`
- Failure-path diagnostic: parity tests must assert the explicit dispatch outcome for each known built-in (`rpc`, `surface`, `local`, or `reject`) and, for GSD-specific commands, assert that the dispatcher preserves the extension-command path instead of rejecting or reclassifying them

## Observability / Diagnostics

- Runtime signals: explicit slash-command outcome state in the workspace store, browser-visible terminal/rejection lines for rejected commands, surface busy/error state for model/auth/session actions, and existing onboarding bridge-refresh state for auth mutations
- Inspection surfaces: `data-testid`-tagged command surface(s), workspace store snapshot fields for active command surface / last command outcome, `/api/session/command` responses, `/api/onboarding` state, and terminal/status error surfaces
- Failure visibility: rejected built-ins expose a concrete reason, failed RPC-backed mutations leave inspectable error state instead of transcript ambiguity, preserved GSD commands stay visibly routed as prompt/extension commands, and auth refresh failures remain visible through onboarding lock and bridge-refresh diagnostics
- Redaction constraints: never surface raw secrets or credential values; auth failure messages must stay sanitized and reuse the existing redaction boundary in onboarding/bridge services

## Integration Closure

- Upstream surfaces consumed: `packages/pi-coding-agent/src/core/slash-commands.ts`, RPC command/response types in `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts`, GSD extension command registrations under `src/resources/extensions/gsd/`, `web/lib/gsd-workspace-store.tsx`, `web/components/gsd/terminal.tsx`, `web/components/gsd/app-shell.tsx`, `src/web/bridge-service.ts`, `src/web/onboarding-service.ts`, and the existing `/api/session/command` + `/api/onboarding` routes
- New wiring introduced in this slice: a shared browser slash-command dispatcher/result contract plus a browser command surface composed into the app shell and reused by typed slash input and click affordances
- What remains before the milestone is truly usable end-to-end: S02 must finish the broader current-project parity surfaces, S03 must keep those surfaces fresh with targeted live state and recovery diagnostics, and S04 must prove the real `gsd --web` runtime under refresh/reopen/interruption stress

## Tasks

- [x] **T01: Extract the authoritative browser slash-command dispatcher and no-fallthrough contract** `est:45m`
  - Why: The highest-risk S01 gap is that known built-ins typed into the browser terminal still become prompt text. This task closes that safety hole at the shared input boundary before any new UI surface work starts and makes sure the new guard does not break GSD extension commands.
  - Files: `web/lib/browser-slash-command-dispatch.ts`, `web/lib/gsd-workspace-store.tsx`, `web/components/gsd/terminal.tsx`, `src/tests/web-command-parity-contract.test.ts`
  - Do: Create a pure browser slash-command dispatch module that imports `BUILTIN_SLASH_COMMANDS` and returns one explicit outcome per known built-in: `rpc`, `surface`, `local`, `reject`, or normal `prompt` for non-built-ins. Cover at least `/model`, `/thinking`, `/resume`, `/fork`, `/compact`, `/login`, `/logout`, `/settings`, `/session`, `/export`, `/state`, `/new`, `/refresh`, and the deferred built-ins that must reject clearly. Replace the terminal/store input path so typed built-ins go through this dispatcher instead of `buildPromptCommand` fallthrough, record browser-visible rejection lines for rejected commands, and add contract coverage proving the full current GSD slash-command family still routes through the supported prompt/extension path, with explicit named checks for `/gsd`, `/gsd status`, `/worktree list`, `/wt list`, `/kill`, and `/exit`.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-command-parity-contract.test.ts`
  - Done when: every known built-in has an explicit dispatch outcome, typed built-ins no longer map to `prompt`/`follow_up`, and the contract test proves both the no-fallthrough invariant and GSD-command preservation
- [x] **T02: Build the real browser surfaces for model, thinking, settings, and auth controls** `est:1h`
  - Why: Safe dispatch is not enough — S01’s demo requires browser-native outcomes for the daily-use controls behind `/model`, `/thinking`, `/settings`, `/login`, and `/logout`, and the existing settings affordance is still inert.
  - Files: `web/components/gsd/command-surface.tsx`, `web/components/gsd/app-shell.tsx`, `web/components/gsd/sidebar.tsx`, `web/lib/gsd-workspace-store.tsx`, `src/web/web-auth-storage.ts`, `src/web/onboarding-service.ts`, `web/app/api/onboarding/route.ts`, `src/tests/web-command-parity-contract.test.ts`, `src/tests/web-onboarding-contract.test.ts`
  - Do: Add store state/actions for a shared browser command surface and wire `/settings`, `/model`, `/thinking`, `/login`, and `/logout` to it. Use real RPC-backed model/thinking actions (`get_available_models`, `set_model`, `set_thinking_level`) and extend the onboarding/auth service contract as needed so browser auth entry and logout are inspectable, refresh bridge auth correctly, and expose failure state without leaking secrets. Make at least one existing visible affordance real — the sidebar settings button must open the same surface the slash commands use, not a separate code path.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-command-parity-contract.test.ts src/tests/web-onboarding-contract.test.ts`
  - Done when: typed and clicked settings/model/auth controls open the same browser surface, model/thinking changes hit real RPC commands, login/logout flows expose real browser state, and the updated tests prove success plus failure visibility
- [x] **T03: Close session/fork/compact parity and prove assembled slash-command behavior** `est:1h`
  - Why: The slice is only true once the remaining daily-use current-project controls — especially `/resume`, `/fork`, `/session`, `/export`, and `/compact` — behave safely and the assembled browser command path is proven end-to-end enough for S02/S03 to build on.
  - Files: `web/components/gsd/command-surface.tsx`, `web/components/gsd/dashboard.tsx`, `web/lib/gsd-workspace-store.tsx`, `src/tests/web-command-parity-contract.test.ts`, `src/tests/web-live-interaction-contract.test.ts`, `src/tests/integration/web-mode-assembled.test.ts`
  - Do: Extend the shared command surface/result contract for session controls backed by existing boot and RPC data: `/resume` uses `boot.resumableSessions` + `switch_session`, `/fork` uses `get_fork_messages` + `fork`, `/session` loads `get_session_stats` and exposes `export_html`, and `/compact` executes real compaction with optional custom instructions. Reuse the same dispatch path from existing session affordances (dashboard session picker/buttons) so typed and clicked flows stay aligned. Add explicit reject coverage for remaining deferred built-ins such as `/share`, `/copy`, `/changelog`, `/hotkeys`, `/tree`, `/reload`, and `/quit`, then extend the assembled integration proof so known built-ins are shown to execute, open a surface, or reject — and a representative GSD-specific command such as `/gsd status` is shown to stay on the supported extension-command path rather than being swallowed or rejected.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-command-parity-contract.test.ts src/tests/web-live-interaction-contract.test.ts src/tests/integration/web-mode-assembled.test.ts && npm run build:web-host`
  - Done when: the daily-use built-ins named in the slice demo are all mapped to real browser outcomes, deferred built-ins reject clearly, representative GSD commands remain supported, the assembled integration proof shows no built-in prompt fallthrough, and the web host build stays green

## Files Likely Touched

- `web/lib/browser-slash-command-dispatch.ts`
- `web/lib/gsd-workspace-store.tsx`
- `web/components/gsd/terminal.tsx`
- `web/components/gsd/app-shell.tsx`
- `web/components/gsd/sidebar.tsx`
- `web/components/gsd/dashboard.tsx`
- `web/components/gsd/command-surface.tsx`
- `src/web/web-auth-storage.ts`
- `src/web/onboarding-service.ts`
- `web/app/api/onboarding/route.ts`
- `src/tests/web-command-parity-contract.test.ts`
- `src/tests/integration/web-mode-assembled.test.ts`
