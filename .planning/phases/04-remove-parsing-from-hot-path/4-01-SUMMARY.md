---
phase: 04-remove-parsing-from-hot-path
plan: 01
subsystem: parser-relocation
tags: [wave-2, import-boundary, legacy-parsers, CLN-07]

# Dependency graph
requires:
  - phase: 04-remove-parsing-from-hot-path
    plan: 00
    provides: "Import boundary test scaffolds (RED tests waiting for parser relocation)"
provides:
  - "legacy/parsers.ts module with parseRoadmap, parsePlan, parseSummary"
  - "Import boundary enforcement (hot-path callers stripped of parse imports)"
  - "Display callers redirected to legacy/parsers.ts"
affects: [4-02, 4-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [import-boundary-enforcement, todo-markers-for-deferred-engine-queries]

key-files:
  created:
    - src/resources/extensions/gsd/legacy/parsers.ts
  modified:
    - src/resources/extensions/gsd/files.ts
    - src/resources/extensions/gsd/auto-dashboard.ts
    - src/resources/extensions/gsd/auto-worktree.ts
    - src/resources/extensions/gsd/parallel-eligibility.ts
    - src/resources/extensions/gsd/visualizer-data.ts
    - src/resources/extensions/gsd/workflow-migration.ts
    - src/resources/extensions/gsd/guided-flow.ts
    - src/resources/extensions/gsd/auto-direct-dispatch.ts
    - src/resources/extensions/gsd/dashboard-overlay.ts
    - src/resources/extensions/gsd/workspace-index.ts
    - src/resources/extensions/gsd/auto-post-unit.ts
    - src/resources/extensions/gsd/auto-verification.ts
    - src/resources/extensions/gsd/reactive-graph.ts
    - src/resources/extensions/gsd/bootstrap/system-context.ts
    - src/resources/extensions/gsd/auto-prompts.ts
    - src/resources/extensions/gsd/auto-dispatch.ts
    - src/resources/extensions/gsd/doctor-checks.ts
    - src/resources/extensions/gsd/doctor.ts
    - src/resources/extensions/gsd/auto-recovery.ts
    - src/resources/extensions/gsd/state.ts
    - src/resources/extensions/gsd/tests/auto-recovery.test.ts
    - src/resources/extensions/gsd/tests/parsers.test.ts
    - src/resources/extensions/gsd/tests/roadmap-slices.test.ts
    - src/resources/extensions/gsd/tests/replan-slice.test.ts
    - src/resources/extensions/gsd/tests/migrate-writer-integration.test.ts

key-decisions:
  - "Exported cachedParse from files.ts so legacy/parsers.ts shares the same parse cache (clearParseCache still works)"
  - "auto-prompts.ts and auto-dispatch.ts added as display callers (not in original plan but required for compile)"
  - "Hot-path usage sites stubbed with safe defaults (false/null/empty) rather than commented out entirely to keep code compiling"
  - "Test files updated to import from legacy/parsers.ts since they are display callers"

patterns-established:
  - "TODO(phase-4-plan-02) markers on all hot-path parse usage sites for engine query replacement"
  - "Boundary comment header in legacy/parsers.ts documents permitted and forbidden callers"

requirements-completed: [CLN-07]

# Metrics
duration: 15min
completed: 2026-03-23
---

# Phase 4 Plan 01: Parser Relocation to legacy/parsers.ts Summary

**Relocated parseRoadmap/parsePlan/parseSummary to legacy/parsers.ts with import boundary enforcement across 24 files**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-23T01:16:46Z
- **Completed:** 2026-03-23T01:32:10Z
- **Tasks:** 2
- **Files modified:** 25 (1 created, 24 modified)

## Accomplishments
- Created `src/resources/extensions/gsd/legacy/parsers.ts` with boundary comment header documenting permitted and forbidden callers
- Moved parseRoadmap, parsePlan, parseSummary (and their impl helpers) from files.ts to legacy/parsers.ts
- Exported cachedParse from files.ts to share the parse cache between modules
- Updated 15 display callers to import from `./legacy/parsers.js`
- Stripped parse imports from 4 hot-path callers (doctor-checks, doctor, auto-recovery, state)
- Commented out hot-path parse usage sites with TODO markers and safe stubs
- Updated 5 test files to import from `../legacy/parsers.ts`
- All 5 import boundary tests pass GREEN (were RED from Plan 4-00)
- TypeScript compiles clean, 429 parser tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Create legacy/parsers.ts and relocate parse functions from files.ts** - `05243c1b` (feat)
2. **Task 2: Update all display callers and strip hot-path imports** - `35357076` (feat)

## Files Created/Modified
- `src/resources/extensions/gsd/legacy/parsers.ts` - New file: parseRoadmap, parsePlan, parseSummary with boundary comment header
- `src/resources/extensions/gsd/files.ts` - Removed 3 parse functions, exported cachedParse, cleaned unused imports
- `src/resources/extensions/gsd/auto-dashboard.ts` - Import redirected to legacy/parsers.js
- `src/resources/extensions/gsd/auto-worktree.ts` - Import redirected to legacy/parsers.js
- `src/resources/extensions/gsd/parallel-eligibility.ts` - Import split: loadFile from files.js, parsers from legacy/parsers.js
- `src/resources/extensions/gsd/visualizer-data.ts` - Import split: loadFile from files.js, parsers from legacy/parsers.js
- `src/resources/extensions/gsd/workflow-migration.ts` - Import redirected to legacy/parsers.js (gsd migrate - permitted per D-13)
- `src/resources/extensions/gsd/guided-flow.ts` - Import split: loadFile from files.js, parseRoadmap from legacy/parsers.js
- `src/resources/extensions/gsd/auto-direct-dispatch.ts` - Import split: loadFile from files.js, parseRoadmap from legacy/parsers.js
- `src/resources/extensions/gsd/dashboard-overlay.ts` - Import split: loadFile from files.js, parsers from legacy/parsers.js
- `src/resources/extensions/gsd/workspace-index.ts` - Import split: loadFile from files.js, parsers from legacy/parsers.js
- `src/resources/extensions/gsd/auto-post-unit.ts` - Import split: loadFile+resolveAllOverrides from files.js, parseSummary from legacy/parsers.js
- `src/resources/extensions/gsd/auto-verification.ts` - Import split: loadFile from files.js, parsePlan from legacy/parsers.js
- `src/resources/extensions/gsd/reactive-graph.ts` - Import split: loadFile+parseTaskPlanIO from files.js, parsePlan from legacy/parsers.js
- `src/resources/extensions/gsd/bootstrap/system-context.ts` - Import split: utilities from ../files.js, parseSummary from ../legacy/parsers.js
- `src/resources/extensions/gsd/auto-prompts.ts` - Import split: utilities from files.js, parsers from legacy/parsers.js
- `src/resources/extensions/gsd/auto-dispatch.ts` - Import split: utilities from files.js, parseRoadmap from legacy/parsers.js
- `src/resources/extensions/gsd/doctor-checks.ts` - parseRoadmap removed from import, usage sites stubbed
- `src/resources/extensions/gsd/doctor.ts` - parsePlan/parseRoadmap/parseSummary removed from import, usage sites stubbed
- `src/resources/extensions/gsd/auto-recovery.ts` - parseRoadmap/parsePlan removed from import, usage sites commented out
- `src/resources/extensions/gsd/state.ts` - parseRoadmap/parsePlan/parseSummary removed from import, usage sites stubbed with safe defaults
- `src/resources/extensions/gsd/tests/auto-recovery.test.ts` - Import redirected to legacy/parsers.ts
- `src/resources/extensions/gsd/tests/parsers.test.ts` - Import split between files.ts and legacy/parsers.ts
- `src/resources/extensions/gsd/tests/roadmap-slices.test.ts` - Import redirected to legacy/parsers.ts
- `src/resources/extensions/gsd/tests/replan-slice.test.ts` - Import redirected to legacy/parsers.ts
- `src/resources/extensions/gsd/tests/migrate-writer-integration.test.ts` - Import redirected to legacy/parsers.ts

## Decisions Made
- Exported `cachedParse` from files.ts rather than duplicating the cache in legacy/parsers.ts. This ensures `clearParseCache()` (which stays in files.ts) still clears the cache used by relocated parsers.
- Added auto-prompts.ts and auto-dispatch.ts as display callers that needed updating. These were not in the original plan but imported parse functions from files.ts, so removing the exports would break them. (Rule 3 - blocking issue.)
- Hot-path usage sites in doctor-checks, doctor, auto-recovery, and state were stubbed with safe defaults (false, null, empty objects) rather than just commented out, to keep TypeScript compiling and avoid runtime crashes.
- Test files that imported parsers from files.ts were updated to import from legacy/parsers.ts since they are display-only callers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] auto-prompts.ts and auto-dispatch.ts needed import updates**
- **Found during:** Task 2
- **Issue:** These two files imported parseRoadmap/parsePlan/parseSummary from files.js but were not listed in the plan's 13 display callers
- **Fix:** Updated imports to use legacy/parsers.js, same as other display callers
- **Files modified:** src/resources/extensions/gsd/auto-prompts.ts, src/resources/extensions/gsd/auto-dispatch.ts
- **Committed in:** 35357076 (Task 2 commit)

**2. [Rule 3 - Blocking] Test files needed import updates**
- **Found during:** Task 2
- **Issue:** 5 test files imported parse functions from ../files.ts which no longer exports them
- **Fix:** Updated test imports to use ../legacy/parsers.ts
- **Files modified:** 5 test files (auto-recovery, parsers, roadmap-slices, replan-slice, migrate-writer-integration)
- **Committed in:** 35357076 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking issues)
**Impact on plan:** Both fixes were necessary for TypeScript compilation. No scope creep.

## Issues Encountered
- Pre-existing TypeScript compilation errors in monorepo packages (pi-ai, pi-coding-agent) are not related to GSD extension changes

## Next Phase Readiness
- Import boundary is established: 5/5 import-boundary.test.ts tests pass GREEN
- Plans 4-02 and 4-03 can now replace TODO(phase-4-plan-02) markers with engine queries
- legacy/parsers.ts boundary comment documents which callers are permitted vs forbidden

---
*Phase: 04-remove-parsing-from-hot-path*
*Completed: 2026-03-23*
