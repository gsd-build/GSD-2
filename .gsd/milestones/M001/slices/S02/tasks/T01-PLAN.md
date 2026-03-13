---
estimated_steps: 8
estimated_files: 8
---

# T01: Widen all 12 regex/parser sites and fix 4 sort calls

**Slice:** S02 — Regex hardening and backwards compat
**Milestone:** M001

## Description

Replace every `M\d+` regex pattern and bare `.sort()` on milestone ID arrays across 8 source files so that both `M001` and `M-abc123-001` formats are accepted. The dispatch-guard.ts refactor is the most significant change — it must switch from iterate-by-number to scan-directories since new-format IDs can't be reconstructed from a number alone.

## Steps

1. In `state.ts`: widen `findMilestoneIds` regex from `/^(M\d+)/` to `/^(M(?:-[a-z0-9]{6}-)?\d+)/`, change `.sort()` to `.sort(milestoneIdSort)`, widen title-strip regex from `/^M\d+[^:]*:\s*/` to `/^M(?:-[a-z0-9]{6}-)?\d+[^:]*:\s*/`. Add import of `milestoneIdSort` from `./guided-flow.js`.
2. In `workspace-index.ts`: same three changes as state.ts — widen `findMilestoneIds` regex, add `milestoneIdSort`, widen title-strip regex. Add import.
3. In `files.ts`: widen `inlinePriorMilestoneSummary` regex from `/^(M\d+)/` to `/^(M(?:-[a-z0-9]{6}-)?\d+)/`, change `.sort()` to `.sort(milestoneIdSort)`. Add import. Update the comment on line 758 that references the old pattern.
4. In `guided-flow.ts`: change `findMilestoneIds` `.sort()` to `.sort(milestoneIdSort)` (S01 left this lexicographic).
5. In `worktree.ts`: widen `SLICE_BRANCH_RE` milestone capture group from `(M\d+)` to `(M(?:-[a-z0-9]{6}-)?\d+)`.
6. In `worktree-command.ts`: widen `hasExistingMilestones` regex from `/^M\d+/` to `/^M(?:-[a-z0-9]{6}-)?\d+/`.
7. In `index.ts`: widen `MILESTONE_CONTEXT_RE` from `/M\d+-CONTEXT\.md$/` to `/M(?:-[a-z0-9]{6}-)?\d+-CONTEXT\.md$/`. Widen both `executeMatch` and `resumeMatch` prompt dispatch regexes to capture `M(?:-[a-z0-9]{6}-)?\d+` instead of `M\d+`.
8. In `dispatch-guard.ts`: remove `milestoneIdFromNumber()`. Refactor `getPriorSliceCompletionBlocker` to: import `readdirSync` from `node:fs`, `milestonesDir` from `./paths.js`, `extractMilestoneSeq` and `milestoneIdSort` from `./guided-flow.js`. Replace `parseInt(targetMid.slice(1), 10)` with `extractMilestoneSeq(targetMid)`. Replace the `for (let num = 1; ...)` loop with: scan `milestonesDir(base)` for milestone directories matching `/^(M(?:-[a-z0-9]{6}-)?\d+)/`, sort with `milestoneIdSort`, filter to those with seq ≤ target seq, iterate those.

## Must-Haves

- [ ] Zero remaining `M\d+` patterns in the 7 target files (state, workspace-index, files, worktree, worktree-command, index, dispatch-guard)
- [ ] All 4 `.sort()` calls on milestone arrays use `milestoneIdSort`
- [ ] `dispatch-guard.ts` no longer constructs milestone IDs from numbers — scans directories instead
- [ ] Existing tests (`unique-milestone-ids.test.ts`, `next-milestone-id.test.ts`) still pass

## Verification

- `grep -rn 'M\\d+' src/resources/extensions/gsd/{state,workspace-index,files,worktree,worktree-command,index,dispatch-guard}.ts` returns no matches
- `npx vitest run src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts` — 63 passed, 0 failed
- `npx vitest run src/resources/extensions/gsd/tests/next-milestone-id.test.ts` — 8 passed, 0 failed

## Observability Impact

- **What changes:** `dispatch-guard.ts` switches from a number-iteration loop (`for num = 1..N`) to a directory-scanning approach (`readdirSync` + regex filter + `milestoneIdSort`). This eliminates the silent NaN bypass where `parseInt("M-abc123-001".slice(1))` returned NaN and the guard returned null without checking any prior slices.
- **How to inspect:** Run `grep -rn 'M\\d+' src/resources/extensions/gsd/{state,workspace-index,files,worktree,worktree-command,index,dispatch-guard}.ts` — zero hits confirms all patterns widened. Existing tests validate backwards compatibility; T02's `regex-hardening.test.ts` will validate both formats at every site.
- **Failure visibility:** If the dispatch guard scans no directories (empty milestones dir or pattern mismatch), it returns null (no blocker) — same as the old code. The behavioral difference is that new-format milestone IDs now correctly trigger prior-slice completion checks instead of silently skipping them.

## Inputs

- `guided-flow.ts` — `milestoneIdSort`, `extractMilestoneSeq` exports from S01 (import these, don't duplicate)
- S02-RESEARCH.md — precise line numbers and patterns for each of the 12 sites

## Expected Output

- 8 modified source files with all regex patterns widened and sorts fixed
- `dispatch-guard.ts` refactored to scan directories with the new pattern
- No behavioral changes for old-format-only projects (backwards compatible)
