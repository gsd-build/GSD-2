---
estimated_steps: 4
estimated_files: 1
---

# T03: Update parity contract test with exhaustive GSD dispatch coverage

**Slice:** S02 — Browser slash-command dispatch for all upstream commands
**Milestone:** M003

## Description

The existing `web-command-parity-contract.test.ts` is the authoritative test proving that no browser slash command falls through silently. It currently tests built-in commands and has a test asserting GSD commands stay on the prompt path. After T01-T02, GSD commands now dispatch to defined outcomes instead of falling through. This task updates the parity test to:

1. Assert every registered GSD subcommand has an explicit dispatch outcome
2. Verify surface commands open the correct surface names
3. Verify passthrough commands preserve exact input text
4. Verify edge cases (help, bare `/gsd`, unknown subcommands, `/export` vs `/gsd export`)

This is the acceptance gate for S02 — downstream slices depend on this test to prevent regressions.

**Relevant skill:** `test` — match existing test patterns from the file.

## Steps

1. **Read the current test file** (`src/tests/web-command-parity-contract.test.ts`) in full. Understand the patterns: it uses `node:test` and `node:assert/strict`, imports dispatch functions dynamically, and uses helper functions like `assertPromptPassthrough()`.

2. **Update the "registered GSD command roots stay on the prompt/extension path" test** (currently around line ~135). This test currently asserts `/gsd` commands stay on the prompt path. It must be restructured:
   - Keep the assertion that the registered roots list is `["exit", "gsd", "kill", "worktree", "wt"]`
   - For `"gsd"`, bare `/gsd` should still return `kind: "prompt"` (passthrough to bridge, equivalent to `/gsd next`)
   - For `"exit"`, `"kill"`, `"worktree"`, `"wt"` — these should still return `kind: "prompt"` (they're extension commands handled by the bridge)

3. **Update the "current GSD command family samples" test** (currently around line ~145). This test currently asserts `/gsd status` stays on prompt path. Update it:
   - `/gsd status` → now returns `kind: "surface"` with `surface: "gsd-status"` (no longer prompt)
   - `/gsd` (bare) → still returns `kind: "prompt"` passthrough
   - `/worktree list`, `/wt list`, `/kill`, `/exit` → still `kind: "prompt"` passthrough
   - Remove or update the streaming session test for `/gsd status` — it now returns `kind: "surface"` regardless of streaming state

4. **Add a new comprehensive test: "every registered /gsd subcommand has an explicit browser dispatch outcome"**. This is the core acceptance test:
   
   ```typescript
   const EXPECTED_GSD_OUTCOMES = new Map<string, "surface" | "prompt" | "local">([
     // Surface commands (20)
     ["status", "surface"],
     ["visualize", "surface"],
     ["forensics", "surface"],
     ["doctor", "surface"],
     ["skill-health", "surface"],
     ["knowledge", "surface"],
     ["capture", "surface"],
     ["triage", "surface"],
     ["quick", "surface"],
     ["history", "surface"],
     ["undo", "surface"],
     ["inspect", "surface"],
     ["prefs", "surface"],
     ["config", "surface"],
     ["hooks", "surface"],
     ["mode", "surface"],
     ["steer", "surface"],
     ["export", "surface"],
     ["cleanup", "surface"],
     ["queue", "surface"],
     // Bridge passthrough (9)
     ["auto", "prompt"],
     ["next", "prompt"],
     ["stop", "prompt"],
     ["pause", "prompt"],
     ["skip", "prompt"],
     ["discuss", "prompt"],
     ["run-hook", "prompt"],
     ["migrate", "prompt"],
     ["remote", "prompt"],
     // Inline help
     ["help", "local"],
   ])
   ```
   
   The test should:
   - Collect all registered GSD subcommands from `commands.ts` using the existing `collectRegisteredGsdCommandRoots` pattern (but adapted to collect the GSD extension's subcommands — note: the extension registers subcommands differently from top-level commands; check how `commands.ts` registers them)
   - OR: simply hardcode the expected 30 subcommands and assert `EXPECTED_GSD_OUTCOMES.size === 30`
   - For each entry in `EXPECTED_GSD_OUTCOMES`:
     - Dispatch `/gsd ${subcommand}` and assert the result kind matches
     - For surface outcomes, assert `outcome.surface === \`gsd-${subcommand}\``
     - For prompt outcomes, assert `outcome.command.message === \`/gsd ${subcommand}\`` (exact text preserved)
     - For local outcomes (help), assert `outcome.action === "gsd_help"`

5. **Add edge case tests**:
   - `/gsd` (bare, no subcommand) → `kind: "prompt"`, message is `/gsd`
   - `/gsd help` → `kind: "local"`, action is `"gsd_help"`
   - `/gsd unknown-xyz` → `kind: "prompt"` passthrough (unknown subcommands reach bridge, extension shows error)
   - `/export` → `kind: "surface"`, surface is `"export"` (built-in session export, NOT `"gsd-export"`)
   - `/gsd export` → `kind: "surface"`, surface is `"gsd-export"` (GSD milestone export, distinct from built-in)
   - `/gsd forensics detailed` → `kind: "surface"`, surface is `"gsd-forensics"`, args should be `"detailed"` (sub-args preserved)

6. **Add contract surface wiring test**: For each GSD surface outcome, verify the surface can be opened through the contract system:
   ```typescript
   import { commandSurfaceSectionForRequest, openCommandSurfaceState, createInitialCommandSurfaceState, surfaceOutcomeToOpenRequest } from '../../web/lib/command-surface-contract.ts'
   ```
   
   For each surface subcommand, dispatch → convert to open request → open surface state → assert `state.open === true`, `state.section` is not null, and `state.selectedTarget` is not null. This proves the T01→T02 wiring is complete.

## Must-Haves

- [ ] Every registered GSD subcommand (30 total) has an explicit expected outcome in the test
- [ ] Surface commands (20) dispatch to the correct `gsd-*` surface name
- [ ] Passthrough commands (9) preserve exact input text for bridge delivery
- [ ] Help command dispatches to `kind: "local"` with `action: "gsd_help"`
- [ ] Bare `/gsd` passes through to bridge
- [ ] Unknown `/gsd xyz` passes through to bridge
- [ ] `/export` and `/gsd export` are distinct
- [ ] Contract surface wiring test proves every surface opens correctly
- [ ] All existing parity tests still pass (no regressions)

## Verification

- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — all tests pass, including new GSD tests
- Confirm no test is skipped or marked pending

## Inputs

- `src/tests/web-command-parity-contract.test.ts` — existing test file (~330 lines). Uses `node:test`, `node:assert/strict`. Has `collectRegisteredGsdCommandRoots()`, `assertPromptPassthrough()`, and multiple test blocks.
- `web/lib/browser-slash-command-dispatch.ts` — from T01, with `dispatchGSDSubcommand()` and expanded types
- `web/lib/command-surface-contract.ts` — from T02, with new sections, targets, and routing
- T01 output: 20 surface subcommands, 9 passthrough subcommands, 1 help subcommand = 30 total
- T02 output: all 20 surfaces have sections, targets, and IMPLEMENTED entries

## Expected Output

- `src/tests/web-command-parity-contract.test.ts` — expanded with 3-4 new test blocks covering GSD dispatch exhaustiveness, edge cases, and contract surface wiring. File grows from ~330 lines to ~500-550 lines. All tests pass.
