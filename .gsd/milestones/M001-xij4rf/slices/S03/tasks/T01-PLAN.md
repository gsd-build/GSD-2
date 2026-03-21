---
estimated_steps: 3
estimated_files: 2
skills_used:
  - test
---

# T01: Add rule filter to queryJournal and test it

**Slice:** S03 — Journal Query Tool
**Milestone:** M001-xij4rf

## Description

The `JournalQueryFilters` interface in `journal.ts` is missing the `rule` filter required by R011. Add `rule?: string` to the interface and a corresponding filter clause in `queryJournal()`. Add a unit test proving the filter works.

## Steps

1. Open `src/resources/extensions/gsd/journal.ts`. Add `rule?: string` to the `JournalQueryFilters` interface (after the `unitId` field).
2. In the `queryJournal()` function's filter chain (the `entries.filter(e => { ... })` block), add: `if (filters.rule && e.rule !== filters.rule) return false;` — place it after the `eventType` check and before the `unitId` check.
3. Open `src/resources/extensions/gsd/tests/journal.test.ts`. Add a new test `"queryJournal filters by rule"` that:
   - Emits 3 entries: two with `rule: "dispatch-task"` and one with `rule: "post-unit-hook"`
   - Calls `queryJournal(base, { rule: "dispatch-task" })`
   - Asserts result length is 2 and all entries have `rule === "dispatch-task"`

## Must-Haves

- [ ] `JournalQueryFilters` has `rule?: string` field
- [ ] `queryJournal()` filters entries by `rule` when provided
- [ ] New test `"queryJournal filters by rule"` passes
- [ ] All 16 existing journal tests still pass (zero regressions)

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/journal.test.ts` — 17+ tests pass, 0 failures

## Inputs

- `src/resources/extensions/gsd/journal.ts` — contains `JournalQueryFilters` and `queryJournal()` to modify
- `src/resources/extensions/gsd/tests/journal.test.ts` — existing test file to add the new test to

## Expected Output

- `src/resources/extensions/gsd/journal.ts` — modified with `rule` filter support
- `src/resources/extensions/gsd/tests/journal.test.ts` — modified with new `rule` filter test
