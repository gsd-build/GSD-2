---
estimated_steps: 4
estimated_files: 1
---

# T02: Fix /gsd visualize test assertions and verify full green suite

**Slice:** S08 — TUI-to-web 1:1 parity audit and gap closure
**Milestone:** M003

## Description

Fix the 4 pre-existing test failures in `web-command-parity-contract.test.ts` where `/gsd visualize` is expected to dispatch as `"surface"` but actually dispatches as `"view-navigate"` per decision D053. The dispatch behavior is correct — the visualizer is a full app-shell view, not a command surface panel — so the tests need to match reality.

The `EXPECTED_GSD_OUTCOMES` map type currently only allows `"surface" | "prompt" | "local"`. It needs `"view-navigate"` added, and the visualize entry changed accordingly. The "every GSD surface dispatches through the contract wiring" test currently expects 20 surface commands — it needs to expect 19 since visualize is no longer a surface. A new test block should verify the view-navigate dispatch for visualize specifically.

## Steps

1. Read `src/tests/web-command-parity-contract.test.ts` to understand the full test structure and identify all 4 failure points.

2. Update `EXPECTED_GSD_OUTCOMES`:
   - Change the Map type from `Map<string, "surface" | "prompt" | "local">` to `Map<string, "surface" | "prompt" | "local" | "view-navigate">`
   - Change `["visualize", "surface"]` to `["visualize", "view-navigate"]`

3. Update the surface count assertion:
   - In the "every GSD surface dispatches through the contract wiring end-to-end" test, change the filter to exclude `"view-navigate"` entries (it already filters for `kind === "surface"`)
   - Change `assert.equal(gsdSurfaces.length, 20, ...)` to `assert.equal(gsdSurfaces.length, 19, ...)`
   - Update the comment text to say "19 GSD surface subcommands" instead of "20"

4. Add a new test that verifies the view-navigate dispatch:
   ```typescript
   test("/gsd visualize dispatches as view-navigate to the visualizer view", () => {
     const outcome = dispatchBrowserSlashCommand("/gsd visualize")
     assert.equal(outcome.kind, "view-navigate")
     assert.equal(outcome.view, "visualize")
   })
   ```

5. Run verification:
   - `npx tsx --test src/tests/web-command-parity-contract.test.ts` — must pass with 0 failures
   - `npm run build` — must exit 0
   - `npm run build:web-host` — must exit 0

## Must-Haves

- [ ] `EXPECTED_GSD_OUTCOMES` maps `visualize` to `"view-navigate"` instead of `"surface"`
- [ ] Surface count assertion updated from 20 to 19
- [ ] New test block verifies `/gsd visualize` dispatches as `view-navigate` with `view: "visualize"`
- [ ] `npx tsx --test src/tests/web-command-parity-contract.test.ts` passes with 0 failures
- [ ] `npm run build` exits 0
- [ ] `npm run build:web-host` exits 0

## Verification

- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 0 failures (was 4 failures before)
- `npm run build` — exit 0
- `npm run build:web-host` — exit 0

## Inputs

- `src/tests/web-command-parity-contract.test.ts` — test file with 4 failing assertions for `/gsd visualize`
- `web/lib/browser-slash-command-dispatch.ts` — the dispatch implementation that returns `kind: "view-navigate"` for visualize (reference, not modified)
- Decision D053 — rationale for why visualize uses `view-navigate` instead of `surface`

## Expected Output

- `src/tests/web-command-parity-contract.test.ts` — updated with correct visualize dispatch expectations, passing 0 failures
