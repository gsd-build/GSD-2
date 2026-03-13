# S02: Regex hardening and backwards compat

**Goal:** All code paths accept both `M001` and `M-abc123-001` milestone ID formats — directory scanning, title stripping, branch parsing, prompt dispatch, context write-gating, and dispatch guarding work with mixed-format milestone directories.
**Demo:** A new test suite (`regex-hardening.test.ts`) passes with assertions covering each of the 12 regex/parser sites and 4 sort fixes, proving both old and new format inputs are handled correctly.

## Must-Haves

- All 10 regex sites widened from `M\d+` to `M(?:-[a-z0-9]{6}-)?\d+`
- `dispatch-guard.ts` refactored from iterate-by-number to scan-directories approach using `extractMilestoneSeq`
- All 4 `.sort()` calls on milestone ID arrays use `milestoneIdSort` comparator
- `SLICE_BRANCH_RE` matches `gsd/M-abc123-001/S01` and `gsd/worktree/M-abc123-001/S01`
- Title stripping handles `M-abc123-001: Title` correctly
- `MILESTONE_CONTEXT_RE` matches `M-abc123-001-CONTEXT.md`
- Prompt dispatch regexes capture `M-abc123-001` from execute/resume prompts
- Test suite with per-site sections covering both formats

## Proof Level

- This slice proves: contract (regex/parser behavior at each site)
- Real runtime required: no (pure regex and string operations)
- Human/UAT required: no

## Verification

- `npx vitest run src/resources/extensions/gsd/tests/regex-hardening.test.ts` — all assertions pass
- `npx vitest run src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts` — S01 tests still pass (regression)
- `npx vitest run src/resources/extensions/gsd/tests/next-milestone-id.test.ts` — backwards compat still passes
- `grep -rn 'M\\d+' src/resources/extensions/gsd/{state,workspace-index,files,worktree,worktree-command,index,dispatch-guard}.ts` returns zero hits (no old-format-only patterns remain)
- Failure-path check: `regex-hardening.test.ts` includes assertions that old code would silently bypass (e.g. `dispatch-guard` with new-format IDs returning null from NaN parse, `milestoneIdSort` producing wrong order with mixed formats)

## Observability / Diagnostics

- **Runtime signals:** The regex patterns and sort comparators are pure functions with no logging. Failures manifest as silent mismatches (directories not found, IDs not parsed, wrong sort order). No new runtime logging is added — the test suite is the diagnostic surface.
- **Inspection surfaces:** `dispatch-guard.ts` will now scan actual milestone directories via `readdirSync` + `milestonesDir()`. If the guard silently returns `null` for new-format IDs, the test suite detects this. The `regex-hardening.test.ts` file serves as the primary inspection surface for all 12 sites.
- **Failure visibility:** If any regex pattern fails to match a new-format ID, the corresponding test assertion fails with a descriptive message including the input and expected output. `dispatch-guard.ts` refactoring makes the NaN-silent-bypass failure path impossible (the old `parseInt(slice(1))` path is removed).
- **Redaction:** No secrets or user data involved in regex/parser operations.

## Integration Closure

- Upstream surfaces consumed: `MILESTONE_ID_RE`, `extractMilestoneSeq`, `milestoneIdSort` from `guided-flow.ts` (S01)
- New wiring introduced in this slice: `dispatch-guard.ts` now imports from `guided-flow.ts` and `paths.js` (adds `milestonesDir`, `extractMilestoneSeq`, `milestoneIdSort`)
- What remains before the milestone is truly usable end-to-end: S03 (wizard/docs), S04 (integration tests with real `deriveState()`)

## Tasks

- [x] **T01: Widen all 12 regex/parser sites and fix 4 sort calls** `est:25m`
  - Why: Every `M\d+` pattern and bare `.sort()` on milestone arrays is a silent failure point for new-format IDs — this task makes all code paths accept both formats
  - Files: `state.ts`, `workspace-index.ts`, `files.ts`, `worktree.ts`, `worktree-command.ts`, `index.ts`, `dispatch-guard.ts`, `guided-flow.ts`
  - Do: (1) Widen 3 `findMilestoneIds` regexes from `/^(M\d+)/` to `/^(M(?:-[a-z0-9]{6}-)?\d+)/` in state.ts, workspace-index.ts, files.ts. (2) Fix 4 `.sort()` → `.sort(milestoneIdSort)` in guided-flow.ts, state.ts, workspace-index.ts, files.ts — import `milestoneIdSort` from guided-flow.ts. (3) Widen 2 title-strip regexes from `/^M\d+[^:]*:\s*/` to `/^M(?:-[a-z0-9]{6}-)?\d+[^:]*:\s*/`. (4) Widen `SLICE_BRANCH_RE` milestone capture from `(M\d+)` to `(M(?:-[a-z0-9]{6}-)?\d+)`. (5) Widen `hasExistingMilestones` from `/^M\d+/` to `/^M(?:-[a-z0-9]{6}-)?\d+/`. (6) Widen `MILESTONE_CONTEXT_RE` from `/M\d+-CONTEXT\.md$/` to `/M(?:-[a-z0-9]{6}-)?\d+-CONTEXT\.md$/`. (7) Widen 2 prompt dispatch regexes to capture `M(?:-[a-z0-9]{6}-)?\d+`. (8) Refactor dispatch-guard.ts: replace `milestoneIdFromNumber` + `parseInt(slice(1))` with directory scanning via `milestonesDir`/`readdirSync`, filter by `extractMilestoneSeq`, sort with `milestoneIdSort`.
  - Verify: `npx vitest run src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts` and `npx vitest run src/resources/extensions/gsd/tests/next-milestone-id.test.ts` still pass
  - Done when: `grep -rn 'M\\d+' src/resources/extensions/gsd/{state,workspace-index,files,worktree,worktree-command,index,dispatch-guard}.ts` returns zero hits (all old patterns replaced)

- [x] **T02: Write regex-hardening test suite proving all sites accept both formats** `est:20m`
  - Why: Each widened regex and the dispatch-guard refactor needs targeted proof that both `M001` and `M-abc123-001` work — without tests, regressions are silent
  - Files: `tests/regex-hardening.test.ts`, `guided-flow.ts` (import only)
  - Do: Create `regex-hardening.test.ts` following the hand-rolled `assertEq`/`assertTrue`/`assertMatch` pattern from `unique-milestone-ids.test.ts`. One section per site: (a) `findMilestoneIds` regex pattern — matches/rejects, (b) title-strip regex — both formats, (c) `SLICE_BRANCH_RE` — old/new/worktree variants, (d) `hasExistingMilestones` regex pattern, (e) `MILESTONE_CONTEXT_RE` — old/new format filenames, (f) prompt dispatch regexes — execute/resume with both formats, (g) `milestoneIdSort` ordering with mixed arrays, (h) `dispatch-guard` refactored logic — `extractMilestoneSeq` on both formats. Import S01 primitives for sort/parse verification; test regex patterns directly for non-exported regexes.
  - Verify: `npx vitest run src/resources/extensions/gsd/tests/regex-hardening.test.ts` — all assertions pass, 0 failures
  - Done when: Test file has ≥30 assertions with sections covering all 12 sites, all pass

## Files Likely Touched

- `src/resources/extensions/gsd/state.ts`
- `src/resources/extensions/gsd/workspace-index.ts`
- `src/resources/extensions/gsd/files.ts`
- `src/resources/extensions/gsd/worktree.ts`
- `src/resources/extensions/gsd/worktree-command.ts`
- `src/resources/extensions/gsd/index.ts`
- `src/resources/extensions/gsd/dispatch-guard.ts`
- `src/resources/extensions/gsd/guided-flow.ts`
- `src/resources/extensions/gsd/tests/regex-hardening.test.ts`
