---
estimated_steps: 4
estimated_files: 2
---

# T03: Fix shouldRunOnboarding for custom-only users and final verification

**Slice:** S01 — Custom provider onboarding and auth
**Milestone:** M003

## Description

Users who only configure a custom provider (no Anthropic/OpenAI/etc.) currently see the onboarding wizard on every launch because `shouldRunOnboarding()` only checks `LLM_PROVIDER_IDS`. This task extends the check to also look for `models.json` existence, ensuring custom-only users don't get stuck in a wizard loop. Then runs all tests to close the slice.

## Steps

1. In `shouldRunOnboarding()` in `src/onboarding.ts`, add a check for `models.json` existence:
   - Import `existsSync` from `node:fs` and `join` from `node:path` (if not already imported from T02)
   - After the existing `hasLlmAuth` check, add: `const hasModelsJson = existsSync(join(agentDir, 'models.json'))`
   - Change the return to: `return !hasLlmAuth && !hasModelsJson`
   - This means: skip onboarding if the user has any LLM provider authed OR has a `models.json` file

2. Update the `shouldRunOnboarding` test in `src/tests/custom-provider.test.ts` to verify:
   - Returns `false` when `models.json` exists at the expected path (mock with temp dir)
   - Returns `true` when neither LLM auth nor `models.json` exists
   - The test must create a temp directory structure mimicking `~/.gsd/agent/`, write a `models.json` there, and verify the logic. Since `shouldRunOnboarding()` uses the hardcoded `agentDir` path, the test may need to verify the logic by testing the condition directly rather than calling the function (or by testing via the exported function with appropriate setup).

3. Run the full custom-provider test suite: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/custom-provider.test.ts` — all tests should now pass.

4. Run the full project test suite: `npm test` — ensure no regressions in existing tests.

## Must-Haves

- [ ] `shouldRunOnboarding()` returns `false` when `models.json` exists at `~/.gsd/agent/models.json`
- [ ] `shouldRunOnboarding()` still returns `false` when any known LLM provider is authed (existing behavior preserved)
- [ ] `shouldRunOnboarding()` still returns `true` when neither condition is met (new user)
- [ ] All custom provider tests pass
- [ ] Full test suite passes with no regressions

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/custom-provider.test.ts` — all pass
- `npm test` — full suite passes
- Read `shouldRunOnboarding()` and confirm the `models.json` check is present

## Observability Impact

- Signals added/changed: None — `shouldRunOnboarding()` is a pure predicate
- How a future agent inspects this: check `shouldRunOnboarding()` source; the condition is a single `return` line
- Failure state exposed: if models.json check is wrong, the wizard either always shows (annoying) or never shows (dangerous) — test assertions catch both

## Inputs

- `src/onboarding.ts` — with `runCustomProviderFlow()` and all wizard logic from T01/T02
- `src/tests/custom-provider.test.ts` — with template and file-write tests from T01/T02
- `src/app-paths.ts` — for `agentDir` constant

## Expected Output

- `src/onboarding.ts` — `shouldRunOnboarding()` extended with `models.json` existence check
- `src/tests/custom-provider.test.ts` — all tests passing including `shouldRunOnboarding` behavior
