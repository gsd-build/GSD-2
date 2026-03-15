---
estimated_steps: 5
estimated_files: 2
---

# T01: Add prompt char measurement to UnitMetrics and dispatch path

**Slice:** S04 — Token Measurement + State Derivation from DB
**Milestone:** M001

## Description

Extend the `UnitMetrics` type with `promptCharCount` and `baselineCharCount` optional fields that capture prompt string length at dispatch time. Wire measurement into `auto.ts` after `finalPrompt` is assembled but before dispatch. For the baseline, compute the total character count of full DECISIONS.md + REQUIREMENTS.md + PROJECT.md via `inlineGsdRootFile` calls. This gives R010 concrete per-unit data and enables R016 validation.

## Steps

1. Add `promptCharCount?: number` and `baselineCharCount?: number` optional fields to the `UnitMetrics` interface in `metrics.ts`
2. Add `promptCharCount` and `baselineCharCount` optional parameters to `snapshotUnitMetrics()` — store them on the unit record when provided
3. In `auto.ts`, after `finalPrompt` is fully assembled (after recovery/retry/repair injections, ~line 2128), compute `finalPrompt.length` as the prompt char count
4. For the baseline: when `isDbAvailable()` is true, call `inlineGsdRootFile` for decisions.md, requirements.md, and project.md — sum their lengths. When DB is off, skip (savings = 0 since both paths are identical). Store the sum as `baselineCharCount`.
5. Pass both values through to `snapshotUnitMetrics()` at the dispatch call site (~line 2285-2311 area, and the main call at line 889)

## Must-Haves

- [ ] `UnitMetrics.promptCharCount` and `UnitMetrics.baselineCharCount` fields exist as optional numbers
- [ ] `snapshotUnitMetrics` accepts and stores these values
- [ ] `finalPrompt.length` is captured after full assembly
- [ ] Baseline is computed from full-markdown file sizes when DB is active
- [ ] Existing metrics tests pass without modification

## Verification

- `npx tsc --noEmit` — clean compilation
- `npm run test:unit` — all existing tests pass
- `grep "promptCharCount" src/resources/extensions/gsd/metrics.ts` — field exists in UnitMetrics

## Inputs

- `src/resources/extensions/gsd/metrics.ts` — existing UnitMetrics type and snapshotUnitMetrics function
- `src/resources/extensions/gsd/auto.ts` — dispatch path with finalPrompt assembly and snapshotUnitMetrics call sites
- S03 summary — isDbAvailable static import already in auto.ts, inlineGsdRootFile still available for baseline computation

## Expected Output

- `src/resources/extensions/gsd/metrics.ts` — UnitMetrics extended with prompt measurement fields, snapshotUnitMetrics updated
- `src/resources/extensions/gsd/auto.ts` — prompt char measurement wired into dispatch path

## Observability Impact

- **New signals:** `promptCharCount` and `baselineCharCount` fields on every `UnitMetrics` record in `metrics.json`. Both are optional numbers — present when measurement fires at dispatch time.
- **Inspection:** `jq '.units[-1] | {promptCharCount, baselineCharCount}' .gsd/metrics.json` shows per-unit prompt size and full-markdown baseline. Savings percentage derivable as `(baseline - actual) / baseline * 100`.
- **Failure visibility:** If fields are absent from a persisted unit record, measurement was not wired for that dispatch path. If `baselineCharCount` is absent but `promptCharCount` is present, DB was unavailable at dispatch time (expected D003 fallback behavior).
- **No breaking changes:** Fields are optional; existing consumers and tests are unaffected.
