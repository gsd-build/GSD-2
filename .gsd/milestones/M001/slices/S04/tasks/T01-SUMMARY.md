---
id: T01
parent: S04
milestone: M001
provides:
  - promptCharCount and baselineCharCount fields on UnitMetrics
  - Prompt measurement wired into all dispatch path snapshotUnitMetrics call sites
  - Baseline computation from full-markdown file sizes when DB is active
key_files:
  - src/resources/extensions/gsd/metrics.ts
  - src/resources/extensions/gsd/auto.ts
key_decisions:
  - Module-scoped lastPromptCharCount/lastBaselineCharCount in auto.ts rather than threading through function params — all 13 snapshotUnitMetrics call sites get measurement via opts param
  - Baseline computed via inlineGsdRootFile (full-markdown path) only when isDbAvailable() is true — when DB is off, savings=0 by definition
patterns_established:
  - Optional opts bag on snapshotUnitMetrics for extensible metric fields
  - Reset measurement vars at top of dispatchNextUnit to prevent stale data leaking across dispatches
observability_surfaces:
  - promptCharCount and baselineCharCount fields in metrics.json unit records
duration: 15m
verification_result: passed
completed_at: 2025-03-15
blocker_discovered: false
---

# T01: Add prompt char measurement to UnitMetrics and dispatch path

**Extended UnitMetrics with promptCharCount/baselineCharCount and wired measurement into all 13 dispatch path snapshotUnitMetrics call sites**

## What Happened

Added `promptCharCount?: number` and `baselineCharCount?: number` optional fields to the `UnitMetrics` interface. Updated `snapshotUnitMetrics()` to accept an optional `opts` bag containing these values, storing them on the unit record via conditional spread.

In `auto.ts`, added module-scoped `lastPromptCharCount` and `lastBaselineCharCount` variables. After `finalPrompt` is fully assembled (after recovery/retry/repair injections and observability repair block), `finalPrompt.length` is captured as `lastPromptCharCount`. When `isDbAvailable()` is true, the baseline is computed by calling `inlineGsdRootFile` for decisions.md, requirements.md, and project.md and summing their lengths. The values are reset at the top of `dispatchNextUnit` to prevent stale data.

All 13 `snapshotUnitMetrics` call sites (12 single-line + 1 multi-line) within the dispatch path were updated to pass `{ promptCharCount: lastPromptCharCount, baselineCharCount: lastBaselineCharCount }`.

## Verification

- `npx tsc --noEmit` — clean compilation, zero errors
- `npm run test:unit` — all 285 tests pass, no regressions
- `grep "promptCharCount" src/resources/extensions/gsd/metrics.ts` — field exists in UnitMetrics interface and snapshotUnitMetrics opts
- `grep -c "promptCharCount\|baselineCharCount" src/resources/extensions/gsd/metrics.ts` — returns 5 (interface fields + opts + conditional spreads)

### Slice-level verification status (T01 is intermediate — partial passes expected):
- `npm run test:unit -- --test-name-pattern "derive-state-db"` — no matching tests yet (T02 creates this)
- `npm run test:unit -- --test-name-pattern "token-savings"` — no matching tests yet (T03 creates this)
- `npx tsc --noEmit` — ✅ passes
- `npm run test:unit` — ✅ all 285 pass
- `grep -c "promptCharCount\|baselineCharCount" src/resources/extensions/gsd/metrics.ts` — ✅ returns 5

## Diagnostics

- `jq '.units[-1] | {promptCharCount, baselineCharCount}' .gsd/metrics.json` — inspect per-unit prompt measurement after a dispatch
- Savings derivable as `(baselineCharCount - promptCharCount) / baselineCharCount * 100`
- Missing `baselineCharCount` with present `promptCharCount` indicates DB was unavailable (expected D003 fallback)
- Missing both fields indicates measurement not wired for that dispatch path (should not happen after this task)

## Deviations

- Plan targeted "~line 2285-2311 area, and the main call at line 889" but all 13 snapshotUnitMetrics call sites within the dispatch scope were updated for consistency — timeout, idle, hook, and normal paths all carry measurement data.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/metrics.ts` — Added promptCharCount/baselineCharCount to UnitMetrics interface; added opts param to snapshotUnitMetrics
- `src/resources/extensions/gsd/auto.ts` — Added module-scoped measurement vars, prompt measurement computation after finalPrompt assembly, passed opts to all 13 snapshotUnitMetrics call sites
- `.gsd/milestones/M001/slices/S04/S04-PLAN.md` — Marked T01 done; added diagnostic verification step (pre-flight fix)
- `.gsd/milestones/M001/slices/S04/tasks/T01-PLAN.md` — Added Observability Impact section (pre-flight fix)
