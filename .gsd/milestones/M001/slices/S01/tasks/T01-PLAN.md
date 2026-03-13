---
estimated_steps: 10
estimated_files: 3
---

# T01: Implement ID primitives, preferences field, and call site wiring

**Slice:** S01 — ID generation and config plumbing
**Milestone:** M001

## Description

Add all new ID-related functions to guided-flow.ts, fix existing functions to handle mixed formats, plumb `unique_milestone_ids` through the preferences system, and wire call sites to read the preference and pass it to `nextMilestoneId()`. This is the complete production code for S01.

## Steps

1. Add `import { randomInt } from "node:crypto"` to guided-flow.ts
2. Add exported constants and functions above the existing `maxMilestoneNum`:
   - `MILESTONE_ID_RE`: `/^M(?:-[a-z0-9]{6}-)?\d{3}$/` — matches both `M001` and `M-abc123-001`
   - `extractMilestoneSeq(id: string): number` — apply regex, parse trailing digits, return 0 on non-match
   - `parseMilestoneId(id: string): { prefix?: string; num: number }` — structured parse of either format
   - `milestoneIdSort(a: string, b: string): number` — comparator using `extractMilestoneSeq`
   - `generateMilestonePrefix(): string` — 6-char lowercase `[a-z0-9]` using `crypto.randomInt(36)` per char
3. Modify `maxMilestoneNum()` to use `extractMilestoneSeq()` instead of `parseInt(id.replace(/^M/, ""), 10)` — filters out NaN/0 values
4. Add `uniqueEnabled?: boolean` parameter to `nextMilestoneId()`. When truthy: generate prefix via `generateMilestonePrefix()`, format as `M-{prefix}-{seq}`. When falsy: existing behavior.
5. Widen `findMilestoneIds()` regex from `/^(M\d+)/` to a pattern that captures both `M001` and `M-abc123-001` from directory names like `M001-CONTEXT` or `M-abc123-001/`
6. Fix `showQueue()` (lines 169-171): replace manual `M${...}` construction with calls to `nextMilestoneId(milestoneIds, uniqueEnabled)`. For `nextIdPlus1`, call `nextMilestoneId([...milestoneIds, nextId], uniqueEnabled)` — this handles both formats correctly without pre-generating random prefixes.
7. Wire the 3 call sites in `showSmartEntry` (lines ~521, ~583, ~651) to read `unique_milestone_ids` from `loadEffectiveGSDPreferences()` and pass to `nextMilestoneId()`
8. Add `unique_milestone_ids?: boolean` to `GSDPreferences` interface in preferences.ts
9. Add validation in `validatePreferences()`: `if (preferences.unique_milestone_ids !== undefined) { validated.unique_milestone_ids = !!preferences.unique_milestone_ids; }` (follows `uat_dispatch` pattern exactly)
10. Add merge in `mergePreferences()`: `unique_milestone_ids: override.unique_milestone_ids ?? base.unique_milestone_ids`
11. Add `"unique_milestone_ids"` to `orderedKeys` array in `serializePreferencesToFrontmatter()` in commands.ts (after `uat_dispatch`)

## Must-Haves

- [ ] `MILESTONE_ID_RE` exported and anchored with `^` and `$`
- [ ] `extractMilestoneSeq` returns 0 for non-matches, correct number for both formats
- [ ] `parseMilestoneId` exported for S02 consumption
- [ ] `generateMilestonePrefix` uses `crypto.randomInt()`, not `Math.random()`
- [ ] `maxMilestoneNum` no longer returns NaN for new-format IDs
- [ ] `findMilestoneIds` captures new-format directory names
- [ ] `showQueue` uses `nextMilestoneId()` — no manual format construction
- [ ] All 3 `showSmartEntry` call sites pass preference boolean
- [ ] `GSDPreferences` interface includes `unique_milestone_ids`
- [ ] Validation, merge, and serialization all handle the new field
- [ ] Existing `npm test` still passes (function signature change is backwards-compatible)

## Observability Impact

- `extractMilestoneSeq()` returns 0 for unrecognized IDs — callers detect invalid inputs without exceptions
- `parseMilestoneId()` returns `{ num: 0 }` for non-matching strings — structured failure result
- `maxMilestoneNum()` now filters NaN/0 values from `extractMilestoneSeq` — prevents NaN propagation in ID generation
- `MILESTONE_ID_RE` exported — external code can validate milestone IDs at boundaries
- Future agents inspect this via: `grep -n 'extractMilestoneSeq\|MILESTONE_ID_RE\|parseMilestoneId' src/resources/extensions/gsd/guided-flow.ts`

## Verification

- `npm test` passes — existing tests prove backwards compatibility since `uniqueEnabled` defaults to falsy
- Grep for manual `M${String` patterns in guided-flow.ts — should be zero outside of `nextMilestoneId` itself

## Inputs

- `src/resources/extensions/gsd/guided-flow.ts` — current implementation of `findMilestoneIds`, `maxMilestoneNum`, `nextMilestoneId`, `showQueue`, `showSmartEntry`
- `src/resources/extensions/gsd/preferences.ts` — `GSDPreferences` interface, `validatePreferences`, `mergePreferences`
- `src/resources/extensions/gsd/commands.ts` — `serializePreferencesToFrontmatter` with `orderedKeys`
- S01 research findings on exact line numbers and patterns

## Expected Output

- `src/resources/extensions/gsd/guided-flow.ts` — 6 new exported functions/constants, 3 modified functions, all call sites wired
- `src/resources/extensions/gsd/preferences.ts` — `unique_milestone_ids` in interface, validate, merge
- `src/resources/extensions/gsd/commands.ts` — `orderedKeys` includes new field
