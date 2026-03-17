# S08: TUI-to-web 1:1 parity audit and gap closure

**Goal:** Systematic comparison proves every TUI feature has a working web equivalent — gaps found are fixed or documented with clear disposition.
**Demo:** `S08-PARITY-AUDIT.md` contains a complete feature matrix covering all 30 `/gsd` subcommands, dashboard features, visualizer tabs, and interactive flows. `npx tsx --test src/tests/web-command-parity-contract.test.ts` passes 118/118 (up from 114/118). Both builds succeed.

## Must-Haves

- Complete parity audit document at `.gsd/milestones/M003/slices/S08/S08-PARITY-AUDIT.md` with feature matrix covering every TUI command and behavior
- Every gap classified as: fixed, intentional scope boundary, or deferred — no unclassified gaps
- `/gsd visualize` test assertions updated from `"surface"` to `"view-navigate"` per D053
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` passes 118/118
- `npm run build` exits 0
- `npm run build:web-host` exits 0

## Proof Level

- This slice proves: final-assembly
- Real runtime required: no (compile-time + test-time verification; runtime UAT is human judgment)
- Human/UAT required: yes (parity audit document requires human review for feature completeness)

## Verification

- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 118/118 pass (0 failures)
- `npm run build` — exit 0
- `npm run build:web-host` — exit 0
- `test -f .gsd/milestones/M003/slices/S08/S08-PARITY-AUDIT.md` — file exists
- `rg "This surface will be implemented" web/components/gsd/command-surface.tsx` — 0 matches

## Tasks

- [ ] **T01: Produce the TUI-to-web parity audit document** `est:30m`
  - Why: R109 requires a systematic comparison of every TUI feature against its web equivalent. This is the primary deliverable — a structured document proving the audit was done and recording every gap with its disposition.
  - Files: `.gsd/milestones/M003/slices/S08/S08-PARITY-AUDIT.md`
  - Do: Build a comprehensive feature matrix by reading the TUI command handler (`src/resources/extensions/gsd/commands.ts`), the web dispatch file (`web/lib/browser-slash-command-dispatch.ts`), and the web panel components. For each of the 30 `/gsd` subcommands, document: TUI behavior, web equivalent, parity status (full/partial/view-only/passthrough), and any gaps. Also cover dashboard overlay features, visualizer tabs, and interactive flows (prefs wizard, doctor heal, capture-with-args). Classify every gap as fixed (T02), intentional scope boundary (with rationale), or deferred.
  - Verify: `test -f .gsd/milestones/M003/slices/S08/S08-PARITY-AUDIT.md` and document contains matrix for all 30 subcommands
  - Done when: Audit document exists with complete feature matrix, every gap has a disposition, and no TUI feature is unaccounted for

- [ ] **T02: Fix /gsd visualize test assertions and verify full green suite** `est:15m`
  - Why: 4 test failures in `web-command-parity-contract.test.ts` because `EXPECTED_GSD_OUTCOMES` maps `visualize → "surface"` but D053 intentionally dispatches it as `"view-navigate"`. The tests need to match the correct dispatch behavior.
  - Files: `src/tests/web-command-parity-contract.test.ts`
  - Do: (1) Change `["visualize", "surface"]` to `["visualize", "view-navigate"]` in `EXPECTED_GSD_OUTCOMES`. (2) Update the surface count assertion from 20 to 19 in the "every GSD surface dispatches through the contract wiring end-to-end" test. (3) Add a separate test block for view-navigate outcomes that verifies `/gsd visualize` dispatches correctly with `kind: "view-navigate"` and `view: "visualize"`. (4) Run builds to confirm no regressions.
  - Verify: `npx tsx --test src/tests/web-command-parity-contract.test.ts` passes 118/118 (or more if new assertions added), `npm run build` exit 0, `npm run build:web-host` exit 0
  - Done when: Zero test failures in parity contract suite and both builds pass

## Files Likely Touched

- `.gsd/milestones/M003/slices/S08/S08-PARITY-AUDIT.md`
- `src/tests/web-command-parity-contract.test.ts`
