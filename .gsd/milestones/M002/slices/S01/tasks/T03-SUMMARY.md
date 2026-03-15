---
id: T03
parent: S01
milestone: M002
provides:
  - Real browser-native session controls for `/resume`, `/fork`, `/session`, `/export`, and `/compact`, plus assembled proof that built-ins no longer fall through while GSD slash commands still route through the extension prompt path
key_files:
  - web/components/gsd/command-surface.tsx
  - web/components/gsd/dashboard.tsx
  - web/lib/command-surface-contract.ts
  - web/lib/gsd-workspace-store.tsx
  - src/tests/web-command-parity-contract.test.ts
  - src/tests/web-live-interaction-contract.test.ts
  - src/tests/integration/web-mode-assembled.test.ts
key_decisions:
  - Group the remaining session-oriented browser controls into one shared command-surface contract and reuse the same store action methods from dashboard clicks and typed slash flows
patterns_established:
  - Session built-ins either open the shared browser surface (`/resume`, `/fork`, `/session`, `/export`, `/compact`) or execute through the same store action path reused by dashboard affordances; deferred built-ins reject explicitly and representative GSD commands remain on the prompt/extension path
observability_surfaces:
  - workspace store `commandSurface` now carries session/fork/stats/compaction state (`section`, `pendingAction`, `selectedTarget`, `lastError`, `lastResult`, `forkMessages`, `sessionStats`, `lastCompaction`)
  - browser surface markers `data-testid="command-surface"`, `command-surface-kind`, `command-surface-session`, `command-surface-resume`, `command-surface-fork`, `command-surface-compact`, `command-surface-error`, and `command-surface-result`
  - parity + integration tests now report command-by-command route behavior for execute vs surface vs reject vs preserved GSD prompt routing
  - route-level `/api/session/command` proofs for `get_session_stats`, `export_html`, `switch_session`, `get_fork_messages`, `fork`, and `compact`
duration: 2h
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T03: Close session/fork/compact parity and prove assembled slash-command behavior

**Added real browser session/fork/export/compact controls, wired dashboard session clicks onto the shared action path, and proved built-ins stay safe while `/gsd status` still rides the extension prompt path.**

## What Happened

I extended the shared browser command-surface contract so it now has first-class `resume`, `fork`, `session`, and `compact` sections in addition to the T02 model/thinking/auth sections. The surface state now carries real session observability (`forkMessages`, `sessionStats`, `lastCompaction`) and target/pending/result state for the new actions.

In `web/lib/gsd-workspace-store.tsx` I implemented the real browser actions behind the remaining S01 daily-use built-ins:
- `/resume` now uses `boot.resumableSessions` plus `switch_session`
- `/fork` now loads `get_fork_messages` and applies `fork`
- `/session` now loads `get_session_stats`
- `/export` now runs `export_html` from the session section
- `/compact` now runs real `compact` with optional custom instructions and stores the returned compaction summary/result

I also extended the implemented surface set so those built-ins no longer hit the old reserved-surface placeholder path, and I updated the shared submit boundary so `/new` refreshes boot after success. That let the dashboard session affordances reuse the same paths instead of diverging: the dashboard `New Session` button now calls `submitInput("/new")`, and dashboard session switches now call the same `switchSessionFromSurface()` method used by the command surface.

In `web/components/gsd/command-surface.tsx` I replaced the placeholder session controls with real browser UI cards for resume, fork, session stats/export, and compact. These render from the same store state, auto-load fork messages/session stats when their sections open, and expose the same busy/result/error surfaces used by the earlier model/auth work.

For proof coverage, I expanded:
- `src/tests/web-command-parity-contract.test.ts` with explicit session-surface target expectations, explicit reject-reason assertions for `/share`, `/copy`, `/changelog`, `/hotkeys`, `/tree`, `/reload`, and `/quit`, inspectable session/compaction action-state coverage, and a source-level check that dashboard session controls reuse the shared paths
- `src/tests/web-live-interaction-contract.test.ts` with a route-level roundtrip proving `get_session_stats`, `export_html`, `switch_session`, `get_fork_messages`, `fork`, and `compact` all flow through `/api/session/command`
- `src/tests/integration/web-mode-assembled.test.ts` with an assembled slash-behavior proof showing `/new` executes, `/model` opens a surface, `/share` rejects, and `/gsd status` still routes through the supported prompt/extension path

## Verification

Passed:
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-command-parity-contract.test.ts src/tests/web-live-interaction-contract.test.ts src/tests/integration/web-mode-assembled.test.ts`
- `npm run build:web-host`

Real browser smoke on the staged local host:
- started `dist/web/standalone/server.js` with the repo as the live project context
- opened `http://localhost:3000/`
- typed `/session` into the live browser terminal input and verified the real shared sheet opened with the session section visible (`[data-testid="command-surface"]` + `[data-testid="command-surface-session"]`) and export controls present
- closed the sheet, typed `/share`, and verified the explicit browser-visible reject guidance containing `blocked instead of falling through to the model`

## Diagnostics

- Inspect shared session-command state in `web/lib/gsd-workspace-store.tsx` via `commandSurface.section`, `pendingAction`, `selectedTarget`, `lastError`, `lastResult`, `forkMessages`, `sessionStats`, and `lastCompaction`
- Inspect rendered browser surfaces via `data-testid="command-surface"`, `command-surface-kind`, `command-surface-session`, `command-surface-resume`, `command-surface-fork`, `command-surface-compact`, `command-surface-error`, and `command-surface-result`
- Read command-route failures in `src/tests/web-live-interaction-contract.test.ts` by RPC command name to see whether the regression is in route forwarding vs browser/store wiring
- Read assembled slash-behavior failures in `src/tests/integration/web-mode-assembled.test.ts` to distinguish execute vs surface vs reject vs preserved GSD prompt routing regressions

## Deviations

None.

## Known Issues

- The browser assertion helper’s broad `text_visible` body-text check was noisy against the dense dashboard shell during manual smoke verification, so the live browser proof relied on concrete surface selectors plus the visible reject message rather than a broad whole-page text matcher.

## Files Created/Modified

- `web/lib/command-surface-contract.ts` — expanded the shared browser command-surface contract with session/fork/compact sections, targets, pending actions, and observability fields
- `web/lib/gsd-workspace-store.tsx` — implemented real session/fork/export/compact actions, expanded implemented built-in surfaces, refreshed `/new` through the shared submit path, and exported the new store action methods
- `web/components/gsd/command-surface.tsx` — replaced placeholder session controls with real resume/fork/session/export/compact browser UI backed by the shared store contract
- `web/components/gsd/dashboard.tsx` — rewired dashboard session affordances onto `submitInput("/new")` and `switchSessionFromSurface()`
- `src/tests/web-command-parity-contract.test.ts` — added session-surface target/reject/wiring coverage and inspectable session/compaction action-state assertions
- `src/tests/web-live-interaction-contract.test.ts` — added route-level proof for session/fork/export/compact RPC commands
- `src/tests/integration/web-mode-assembled.test.ts` — added assembled slash-behavior proof for execute vs surface vs reject vs preserved GSD prompt routing
- `.gsd/DECISIONS.md` — recorded the shared session-surface/store-action choice for downstream slices
