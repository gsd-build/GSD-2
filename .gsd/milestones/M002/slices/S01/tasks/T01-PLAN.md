---
estimated_steps: 5
estimated_files: 4
---

# T01: Extract the authoritative browser slash-command dispatcher and no-fallthrough contract

**Slice:** S01 — Safe slash-command dispatch and RPC-backed daily controls
**Milestone:** M002

## Description

The browser terminal currently special-cases only `/state`, `/new`, `/refresh`, and `/clear`; every other slash-prefixed input falls through to prompt text. That is unsafe for built-ins like `/model` or `/logout`, and it becomes even riskier once more browser-native command surfaces land. This task introduces a pure browser slash-command dispatcher at the shared input boundary so known built-ins resolve to explicit outcomes and GSD-specific extension commands remain supported instead of being accidentally rejected.

## Steps

1. Create `web/lib/browser-slash-command-dispatch.ts` as a pure module that imports `BUILTIN_SLASH_COMMANDS` and returns explicit outcomes for slash input: `rpc`, `surface`, `local`, `reject`, or normal `prompt` for non-built-ins.
2. Encode the authoritative built-in mapping for S01-relevant commands: `/model`, `/thinking`, `/resume`, `/fork`, `/compact`, `/login`, `/logout`, `/settings`, `/session`, `/export`, `/state`, `/new`, `/refresh`, plus clear `reject` outcomes for deferred built-ins that should not hit the model.
3. Replace the terminal/store input path so typed built-ins run through the dispatcher rather than `buildPromptCommand` fallthrough. Rejected commands must append a browser-visible error/system line describing the reason.
4. Preserve the full current GSD extension command family by proving the dispatcher leaves those slash commands on the supported prompt/extension path rather than reclassifying them as built-ins or rejects, with explicit named checks for `/gsd`, `/gsd status`, `/worktree list`, `/wt list`, `/kill`, and `/exit`.
5. Add `src/tests/web-command-parity-contract.test.ts` to assert the no-fallthrough invariant for built-ins and the preservation invariant for all currently registered GSD-specific commands.

## Must-Haves

- [ ] Pure dispatcher derives built-in authority from `slash-commands.ts`
- [ ] Known built-ins no longer resolve to `prompt`/`follow_up`
- [ ] Deferred built-ins produce explicit `reject` outcomes with browser-visible guidance
- [ ] All currently registered GSD-specific commands remain supported on the prompt/extension path
- [ ] Contract test proves both invariants

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-command-parity-contract.test.ts`
- The test output identifies the regressed command if any built-in falls through or any currently registered GSD-specific command is rejected

## Observability Impact

- Signals added/changed: slash-command dispatch outcome becomes explicit and inspectable instead of being inferred from transcript text
- How a future agent inspects this: check the dispatcher return value in the contract test and inspect terminal lines/store state for rejected-command messaging
- Failure state exposed: regressions show which slash command was misclassified (`prompt`, `reject`, wrong `rpc`, etc.), including any GSD-registered command that stops being preserved

## Inputs

- `packages/pi-coding-agent/src/core/slash-commands.ts` — authoritative built-in command list
- `web/lib/gsd-workspace-store.tsx` — current `buildPromptCommand` and terminal input path
- `web/components/gsd/terminal.tsx` — current submit behavior
- `src/resources/extensions/gsd/commands.ts`, `src/resources/extensions/gsd/worktree-command.ts`, `src/resources/extensions/gsd/exit-command.ts`, `src/resources/extensions/gsd/index.ts` — the current GSD slash-command registrations that must all keep working

## Expected Output

- `web/lib/browser-slash-command-dispatch.ts` — pure browser slash-command dispatcher with explicit outcomes
- `web/lib/gsd-workspace-store.tsx` — terminal/store input path routed through the dispatcher
- `web/components/gsd/terminal.tsx` — submit flow updated to use explicit dispatch outcomes
- `src/tests/web-command-parity-contract.test.ts` — contract coverage for built-in no-fallthrough plus GSD-command preservation
