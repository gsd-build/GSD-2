---
estimated_steps: 3
estimated_files: 2
---

# T02: Write regex-hardening test suite proving all sites accept both formats

**Slice:** S02 — Regex hardening and backwards compat
**Milestone:** M001

## Description

Create `regex-hardening.test.ts` with targeted assertions for each of the 12 regex/parser sites updated in T01. Each site gets a section proving both `M001` and `M-abc123-001` formats are accepted, plus negative cases where appropriate. Follow the hand-rolled assertion pattern from `unique-milestone-ids.test.ts`.

## Steps

1. Create `src/resources/extensions/gsd/tests/regex-hardening.test.ts` with assertion helpers (`assertEq`, `assertTrue`, `assertMatch`) and `passed`/`failed` counters following `unique-milestone-ids.test.ts` pattern. Import `extractMilestoneSeq`, `milestoneIdSort`, `MILESTONE_ID_RE` from `../guided-flow.ts`.
2. Add test sections — test each regex pattern directly (since most are module-scoped, extract the pattern into a local const and test it):
   - (a) Directory scanning regex `/^(M(?:-[a-z0-9]{6}-)?\d+)/` — matches `M001`, `M-abc123-001`, rejects `S01`, `X001`
   - (b) Title-strip regex `/^M(?:-[a-z0-9]{6}-)?\d+[^:]*:\s*/` — strips `M001: Title` → `Title`, strips `M-abc123-001: Title` → `Title`, strips `M001 — Unique Milestone IDs: Foo` preserving existing behavior
   - (c) `SLICE_BRANCH_RE` (import from `../worktree.ts`) — matches `gsd/M001/S01`, `gsd/M-abc123-001/S01`, `gsd/worktree/M001/S01`, `gsd/worktree/M-abc123-001/S01`, rejects `gsd/S01`, `main`
   - (d) Milestone detection regex `/^M(?:-[a-z0-9]{6}-)?\d+/` — matches both formats, rejects `S01`
   - (e) `MILESTONE_CONTEXT_RE` pattern `/M(?:-[a-z0-9]{6}-)?\d+-CONTEXT\.md$/` — matches `M001-CONTEXT.md`, `M-abc123-001-CONTEXT.md`, rejects `M001-ROADMAP.md`
   - (f) Prompt dispatch regexes — test capture of milestone ID from both old and new format execute/resume prompt strings
   - (g) `milestoneIdSort` with mixed arrays — `['M-abc123-002', 'M001', 'M-xyz789-001']` sorts to sequential order
   - (h) `extractMilestoneSeq` on new-format IDs — confirms dispatch-guard refactor correctness
3. Add `main()` function with summary output and `process.exit(1)` on failure. Run and confirm all pass.

## Must-Haves

- [ ] ≥30 assertions across ≥8 sections
- [ ] Every section tests both old (`M001`) and new (`M-abc123-001`) format inputs
- [ ] `SLICE_BRANCH_RE` section tests with and without worktree prefix
- [ ] Title-strip section preserves existing behavior for edge cases (colons in title body)
- [ ] All assertions pass

## Verification

- `npx vitest run src/resources/extensions/gsd/tests/regex-hardening.test.ts` — all pass, 0 failures
- Test output shows ≥30 passed assertions with section headers

## Inputs

- `guided-flow.ts` — `extractMilestoneSeq`, `milestoneIdSort`, `MILESTONE_ID_RE` (S01 exports)
- `worktree.ts` — `SLICE_BRANCH_RE` (import the actual exported regex)
- T01 completed changes — the widened patterns to verify

## Observability Impact

- **New signal:** `regex-hardening.test.ts` is the primary diagnostic surface for all 12 regex/parser sites. Each section heading prints to stdout, with per-assertion FAIL messages on stderr for any regression.
- **Inspection:** Run `npx vitest run src/resources/extensions/gsd/tests/regex-hardening.test.ts` (or `npx tsx ...`) to confirm all sites accept both formats. Section headers in output map directly to source-file patterns.
- **Failure visibility:** A regression in any widened regex causes a named assertion failure with the exact input and expected output, making root cause trivial to locate.

## Expected Output

- `src/resources/extensions/gsd/tests/regex-hardening.test.ts` — new test file with ≥30 assertions, all passing
