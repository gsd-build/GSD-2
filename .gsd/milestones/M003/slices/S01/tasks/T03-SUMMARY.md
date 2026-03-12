---
id: T03
parent: S01
milestone: M003
provides:
  - shouldRunOnboarding() returns false when models.json exists (custom-only users skip wizard)
  - Three new shouldRunOnboarding test cases covering models.json, no-auth, and LLM-auth scenarios
key_files:
  - src/onboarding.ts
  - src/tests/custom-provider.test.ts
key_decisions:
  - "Added optional agentDirOverride parameter to shouldRunOnboarding() instead of monkeypatching the module-level agentDir — keeps the function testable without module mocking while preserving the default path for production callers"
patterns_established:
  - "Optional directory override parameters for functions that depend on hardcoded paths — enables temp-dir-based testing without module mocking"
observability_surfaces:
  - "none — shouldRunOnboarding() is a pure predicate; incorrect behavior surfaces as the wizard always/never showing"
duration: 10m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T03: Fix shouldRunOnboarding for custom-only users and final verification

**Extended `shouldRunOnboarding()` to check for `models.json` existence, so custom-only provider users skip the onboarding wizard**

## What Happened

Added a `models.json` existence check to `shouldRunOnboarding()` in `src/onboarding.ts`. The function now returns `false` (skip wizard) when either a known LLM provider is authed OR a `models.json` file exists at `agentDir`. This fixes the bug where users who only configured a custom provider (Ollama, LM Studio, etc.) would see the onboarding wizard on every launch.

The function signature gained an optional `agentDirOverride` parameter (defaulting to the imported `agentDir`) to make the logic testable with temp directories. The existing caller in `cli.ts` passes no override, so it uses the real path unchanged.

Updated the test file with three `shouldRunOnboarding` tests:
1. Returns `false` when `models.json` exists but no LLM provider is authed (the bug fix)
2. Returns `true` when neither LLM auth nor `models.json` exists (fresh user)
3. Returns `false` when a known LLM provider is authed (existing behavior preserved)

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/custom-provider.test.ts` — **10/10 tests pass** (7 template tests + 3 shouldRunOnboarding tests)
- `npm test` — **136 pass, 18 fail** — all 18 failures are pre-existing (16 from `VALID_BRANCH_NAME` import error in `preferences.ts`→`git-service.ts`, 2 from `AGENTS.md` sync/pack in `app-smoke.test.ts`). No regressions from this task.
- Read `shouldRunOnboarding()` and confirmed the `models.json` check is present as `const hasModelsJson = existsSync(join(dir, 'models.json'))` with return `!hasLlmAuth && !hasModelsJson`.

## Diagnostics

None — `shouldRunOnboarding()` is a pure predicate. If the check is wrong, it manifests as the wizard always showing (annoying) or never showing (dangerous). The test assertions catch both directions.

## Deviations

Added an `agentDirOverride` optional parameter to `shouldRunOnboarding()` instead of testing the condition directly or using module mocking. This is a minimal, non-breaking API change that keeps the function testable without test infrastructure complexity.

## Known Issues

None.

## Files Created/Modified

- `src/onboarding.ts` — Extended `shouldRunOnboarding()` with `models.json` existence check and optional `agentDirOverride` parameter
- `src/tests/custom-provider.test.ts` — Added 2 new test cases (returns-true fresh user, returns-false LLM auth) and updated existing models.json test to use `agentDirOverride`
