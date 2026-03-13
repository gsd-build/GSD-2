# S01: ID generation and config plumbing

**Goal:** `nextMilestoneId()` returns `M-{rand6}-{seq}` when `unique_milestone_ids: true`, `M001`-style when false/absent. Preferences system supports the new boolean field end-to-end.
**Demo:** Unit tests prove generation, parsing, config plumbing, and call site wiring all work correctly.

## Must-Haves

- `MILESTONE_ID_RE` regex exported, matches both `M001` and `M-abc123-001` (anchored)
- `extractMilestoneSeq(id)` returns sequential number from either format, 0 for non-matches
- `parseMilestoneId(id)` returns `{ prefix?: string, num: number }` for either format
- `milestoneIdSort(a, b)` comparator sorts by sequential number
- `generateMilestonePrefix()` returns 6-char lowercase `[a-z0-9]` via `crypto.randomInt()`
- `nextMilestoneId(milestoneIds, uniqueEnabled?)` returns new format when `uniqueEnabled` is true
- `maxMilestoneNum()` handles mixed-format arrays (no NaN propagation)
- `findMilestoneIds()` in guided-flow.ts matches both directory formats
- `showQueue()` uses `nextMilestoneId()` instead of manual format construction
- All call sites of `nextMilestoneId()` in guided-flow.ts read and pass the preference
- `GSDPreferences.unique_milestone_ids` plumbed through interface, validate, merge, serialize
- All existing tests still pass

## Verification

- `npm test` — all existing + new tests pass
- New test file: `src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts` covers:
  - `MILESTONE_ID_RE` matching both formats and rejecting bad inputs
  - `extractMilestoneSeq` on old, new, and invalid IDs
  - `parseMilestoneId` on both formats
  - `milestoneIdSort` ordering
  - `generateMilestonePrefix` format and length (not randomness)
  - `nextMilestoneId` with `uniqueEnabled` true and false, including mixed arrays
  - `maxMilestoneNum` with mixed-format arrays
  - Preference validation, merge, and serialization round-trip for `unique_milestone_ids`
  - `extractMilestoneSeq` returns 0 for garbage input (failure visibility)
  - `parseMilestoneId` returns `{ num: 0 }` for invalid IDs (structured failure)
  - `maxMilestoneNum` with new-format-only arrays does not return NaN

## Observability / Diagnostics

- `extractMilestoneSeq()` returns 0 for unrecognized inputs — callers can detect unparseable IDs by checking for 0
- `parseMilestoneId()` returns `{ num: 0 }` for invalid IDs — structured parse result makes failure visible without exceptions
- `MILESTONE_ID_RE` exported — downstream code can validate IDs before passing them to functions
- `generateMilestonePrefix()` uses `crypto.randomInt()` — verifiable via `typeof` check on import, no silent fallback to `Math.random()`
- `maxMilestoneNum()` filters NaN/0 — prevents NaN propagation that previously caused silent corruption in ID generation
- No secrets or credentials involved in this slice

## Tasks

- [x] **T01: Implement ID primitives, preferences field, and call site wiring** `est:45m`
  - Why: All production code for the slice — primitives, preferences plumbing, and wiring form one coherent unit
  - Files: `src/resources/extensions/gsd/guided-flow.ts`, `src/resources/extensions/gsd/preferences.ts`, `src/resources/extensions/gsd/commands.ts`
  - Do: (1) Add `MILESTONE_ID_RE`, `extractMilestoneSeq`, `parseMilestoneId`, `milestoneIdSort`, `generateMilestonePrefix` to guided-flow.ts. (2) Modify `maxMilestoneNum` to use `extractMilestoneSeq`. (3) Add `uniqueEnabled?` param to `nextMilestoneId`, generate new format when true. (4) Widen `findMilestoneIds` regex to match both formats. (5) Fix `showQueue` lines 169-171 to use `nextMilestoneId()` instead of manual construction. (6) Wire all `nextMilestoneId()` call sites to read `unique_milestone_ids` from preferences and pass it. (7) Add `unique_milestone_ids?: boolean` to `GSDPreferences` interface. (8) Add validation (follow `uat_dispatch` pattern). (9) Add merge support. (10) Add to `orderedKeys` in serializer. Use `crypto.randomInt()` for random chars — no `Math.random()`.
  - Verify: `npm test` — existing tests pass (new function signature is backwards-compatible with `uniqueEnabled` defaulting to falsy)
  - Done when: All production code changes committed, existing test suite green

- [x] **T02: Add comprehensive unit tests for new exports** `est:30m`
  - Why: S01's boundary contract — S02 consumes these exports, tests prove they work
  - Files: `src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts`
  - Do: Create test file following existing hand-rolled assertion pattern (see `next-milestone-id.test.ts`). Test sections: (a) `MILESTONE_ID_RE` matches/rejects, (b) `extractMilestoneSeq` both formats + invalid, (c) `parseMilestoneId` both formats, (d) `milestoneIdSort` ordering, (e) `generateMilestonePrefix` length and charset, (f) `nextMilestoneId` with uniqueEnabled true/false + mixed arrays, (g) `maxMilestoneNum` with mixed-format arrays including new-format-only, (h) preferences validation/merge/serialization round-trip for `unique_milestone_ids`
  - Verify: `npm test` — all tests pass including new file
  - Done when: New test file passes, covers all exports from boundary map, `npm test` fully green

## Files Likely Touched

- `src/resources/extensions/gsd/guided-flow.ts`
- `src/resources/extensions/gsd/preferences.ts`
- `src/resources/extensions/gsd/commands.ts`
- `src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts`
