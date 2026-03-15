---
estimated_steps: 5
estimated_files: 6
---

# T03: Close session/fork/compact parity and prove assembled slash-command behavior

**Slice:** S01 — Safe slash-command dispatch and RPC-backed daily controls
**Milestone:** M002

## Description

This task closes the remaining daily-use current-project controls for S01 and adds the assembled proof that the browser command path now behaves safely. It extends the shared command surface/result contract for resume/fork/session/export/compact flows, adds explicit rejects for deferred built-ins, and verifies that a representative GSD-specific command still travels through the supported extension-command path.

## Steps

1. Extend the shared command surface/state for session-oriented controls: `/resume` reads `boot.resumableSessions` and applies `switch_session`, `/fork` uses `get_fork_messages` and `fork`, `/session` loads `get_session_stats`, and `/export` calls `export_html` from the session surface.
2. Implement `/compact` as a real compaction action, including optional custom instructions when present, with browser-visible success/failure state.
3. Reuse the same dispatch/actions from existing click affordances (for example dashboard session switch/new-session areas) so typed and clicked flows stay aligned rather than diverging.
4. Add explicit reject coverage for remaining deferred built-ins such as `/share`, `/copy`, `/changelog`, `/hotkeys`, `/tree`, `/reload`, and `/quit`, and extend the command-parity contract to assert their rejection reasons.
5. Extend the assembled integration proof so known built-ins are shown to execute, open a surface, or reject — and a representative GSD-specific command such as `/gsd status` is shown to remain supported on the prompt/extension path, while the parity contract from T01/T03 continues to cover the full current GSD command family.

## Must-Haves

- [ ] `/resume`, `/fork`, `/session`, `/export`, and `/compact` have real browser outcomes
- [ ] Typed and clicked session controls share one dispatch/result path
- [ ] Deferred built-ins reject explicitly with browser-visible reasons
- [ ] Integration proof shows built-ins no longer fall through to prompt text
- [ ] Integration proof also shows representative GSD commands still remain supported
- [ ] Web host build stays green after the new command surface/state wiring

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-command-parity-contract.test.ts src/tests/web-live-interaction-contract.test.ts src/tests/integration/web-mode-assembled.test.ts`
- `npm run build:web-host`

## Observability Impact

- Signals added/changed: session-command surface/result state, explicit rejection reasons for deferred built-ins, integration assertions around prompt-vs-surface-vs-reject command paths
- How a future agent inspects this: read parity contract failures by command name, inspect assembled integration assertions for expected route behavior, and check surface/terminal error state in the store
- Failure state exposed: a regression will show whether the command was wrongly sent as prompt text, opened the wrong surface, failed its RPC mutation, or lost GSD command support

## Inputs

- T01 output — authoritative dispatcher with built-in safety and GSD-command preservation
- T02 output — shared command surface plus model/thinking/auth browser wiring
- `web/components/gsd/dashboard.tsx` — existing session switch/new-session affordances that must reuse the same path
- `web/lib/gsd-workspace-store.tsx` — existing boot payload, command sending, and refresh helpers
- `src/tests/integration/web-mode-assembled.test.ts` — real route-level integration seam for browser command behavior

## Expected Output

- `web/components/gsd/command-surface.tsx` — session/fork/session-stats/export/compact surface modes
- `web/components/gsd/dashboard.tsx` — session affordances wired through the shared dispatch/result contract
- `web/lib/gsd-workspace-store.tsx` — session/compact actions plus deferred-command rejection handling
- `src/tests/web-command-parity-contract.test.ts` — expanded coverage for session controls and deferred built-ins
- `src/tests/web-live-interaction-contract.test.ts`, `src/tests/integration/web-mode-assembled.test.ts` — proof that built-ins are safe and representative GSD commands still work
