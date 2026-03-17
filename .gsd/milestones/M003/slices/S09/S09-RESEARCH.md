# S09 — Research

**Date:** 2026-03-16
**Scope:** Test suite hardening — make `test:unit`, `test:integration`, `test:browser-tools`, `build`, `build:web-host` all pass clean.

## Summary

Current state: both builds pass, `test:browser-tools` passes (110/110), but `test:unit` has 11 failures and `test:integration` has 6 failures. The failures cluster into a small number of root causes, with one dominant issue (the `dist-redirect.mjs` resolver) accounting for 13 of the 17 total failures.

The work is mechanical — fix the test resolver, update stale assertions, and address a few isolated test issues. No architectural decisions needed. No new code beyond test infrastructure fixes.

## Recommendation

Fix in priority order by blast radius:

1. **Fix `dist-redirect.mjs`** — resolves 13/17 failures in one shot
2. **Fix stale source-shape assertion** in `web-mode-cli.test.ts` — 1 failure
3. **Fix `derive-state-db.test.ts`** requirement parsing from DB — 1 failure (3 sub-assertions)
4. **Fix `github-client.test.ts`** environment assumption — 1 failure
5. **Fix `web-diagnostics-contract.test.ts`** `.tsx` import — 1 failure
6. **Assess `stop-auto-remote.test.ts`** timing flake — 1 failure (passes alone, flaky in parallel)

## Implementation Landscape

### Key Files

- `src/resources/extensions/gsd/tests/dist-redirect.mjs` — The test module resolver. Its blanket `.js→.ts` rewrite rule for imports within `/src/` incorrectly rewrites `../../packages/pi-ai/dist/oauth.js` to `dist/oauth.ts` (which doesn't exist). Fix: add an exclusion for paths containing `/dist/` before the blanket rewrite.
- `src/web/web-auth-storage.ts` — Imports `../../packages/pi-ai/dist/oauth.js`. This is the origin of the import chain that breaks 13 tests. The import itself is correct (the `.js` file exists in dist); the resolver is what breaks it.
- `src/web/onboarding-service.ts` — Also imports from `../../packages/pi-ai/dist/oauth.js` (type-only). Same issue.
- `src/tests/web-mode-cli.test.ts` (line 34) — Asserts `web-mode.ts` contains `from './onboarding.js'`. This import was removed during M003 work. The test needs updating to match current source shape.
- `src/resources/extensions/gsd/tests/derive-state-db.test.ts` (line 252-278) — "requirements from DB content" test inserts REQUIREMENTS.md into an in-memory DB but `deriveState()` reads from disk via `loadFile()`, not from DB. The test's expectation doesn't match the actual loading path. Either the test fixture needs to also write to disk, or there's a missing DB-aware file loading hook.
- `src/tests/github-client.test.ts` (line 138-144) — Hardcodes expected remote as `gsd-build/gsd-2` but the fork's remote is `snowdamiz`. Fix: make the test check for non-null result without asserting specific owner/repo, or skip when remote doesn't match.
- `src/tests/web-diagnostics-contract.test.ts` (line 40) — Dynamically imports `../../web/lib/gsd-workspace-store.tsx`. Node's `--experimental-strip-types` doesn't handle `.tsx`. Fix: either add `.tsx` handling to `dist-redirect.mjs`'s load hook, or restructure the import to avoid loading the `.tsx` file at runtime (the test may only need type-level imports from it).
- `src/resources/extensions/gsd/tests/stop-auto-remote.test.ts` — Timing-dependent: sends SIGTERM and asserts process exited. Passes when run alone, fails in parallel suite. Fix: increase wait time or add retry logic.

### Tests affected by each root cause

**Root cause 1: `dist-redirect.mjs` rewrites `dist/oauth.js→dist/oauth.ts`** (13 tests)
- Unit: `web-bridge-contract`, `web-diagnostics-contract`*, `web-live-interaction-contract`, `web-live-state-contract`, `web-onboarding-contract`, `web-recovery-diagnostics-contract`, `web-session-parity-contract` (7 files)
- Integration: `web-mode-assembled`, `web-mode-onboarding`, `web-mode-runtime` ×4 (6 tests in 3 files)

*`web-diagnostics-contract` has a second issue (`.tsx` extension) that surfaces after the oauth fix.

**Root cause 2: Stale source-shape assertion** (1 test)
- `web-mode-cli.test.ts` → "web mode launcher reuses the onboarding browser opener"

**Root cause 3: DB requirements loading** (1 test, 3 sub-assertions)
- `derive-state-db.test.ts` → "requirements from DB content"

**Root cause 4: Hardcoded git remote** (1 test)
- `github-client.test.ts` → "returns owner/repo for the current repository"

**Root cause 5: `.tsx` unsupported in test runner** (1 test)
- `web-diagnostics-contract.test.ts` (after oauth fix)

**Root cause 6: Timing flake** (1 test, intermittent)
- `stop-auto-remote.test.ts` → "sends SIGTERM to a live process"

### Build Order

1. **Fix `dist-redirect.mjs` first** — biggest blast radius (13 tests). Add a guard: if specifier contains `/dist/`, skip the `.js→.ts` rewrite. This is a 2-line change.
2. **Fix `web-mode-cli.test.ts`** — update or remove the stale `from './onboarding.js'` assertion. Check what the test actually needs to verify (that web-mode.ts reuses browser opening) and write a correct assertion.
3. **Fix `.tsx` handling** — add `.tsx` support to `dist-redirect.mjs` load hook or restructure the `web-diagnostics-contract` import.
4. **Fix `derive-state-db.test.ts`** — investigate whether the test should write to disk alongside the DB, or whether `loadFile` should check DB first. The latter would be a runtime change; the former is a test-only fix.
5. **Fix `github-client.test.ts`** — make assertion environment-independent.
6. **Assess `stop-auto-remote.test.ts`** — add tolerance or document as known flake.
7. **Run all four verification commands** to confirm green.

### Verification Approach

```bash
# Individual test files during development
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test <file>

# Full suite verification (the R110 contract)
npm run test:unit          # target: 1141 pass, 0 fail
npm run test:integration   # target: all pass, 0 fail
npm run test:browser-tools # already green: 110/110
npm run build              # already green
npm run build:web-host     # already green
```

## Constraints

- `dist-redirect.mjs` is a shared test resolver used by ALL test suites (`resolve-ts.mjs` registers it). Changes must not break the 1130 tests that already pass.
- Node v25.3.0's `--experimental-strip-types` handles `.ts` but not `.tsx`. The resolver or test must work around this.
- The `web-mode-runtime` integration tests require Playwright and spawn real processes — they're inherently slow (~70s each). Total integration suite runtime will be ~5 minutes.
- D050 established that fork files should use source-relative imports, not `dist/` imports. But `web-auth-storage.ts` still imports from `dist/oauth.js` — the resolver fix is the right approach (not changing the import) because the import is correct for runtime and build.

## Common Pitfalls

- **Breaking the `.js→.ts` rewrite for legitimate cases** — The guard must only skip the rewrite when the resolved path goes into a `dist/` directory. Don't over-restrict (e.g., blocking all `../` paths would break other tests).
- **`web-mode-runtime` tests timing out even after oauth fix** — These tests are slow by nature. If the oauth fix resolves the host crash, they should pass within 60s per test. If they still time out, the issue is environmental and should be documented, not masked.
- **`derive-state-db` requiring a runtime change** — If `loadFile()` doesn't check the DB, the test may be aspirational (testing a feature that was never wired up). Check whether upstream's DB path actually hooks into file loading before spending time on a runtime fix. If the test is aspirational, fix the test to match reality.

## Current Passing State (baseline)

| Suite | Pass | Fail | Status |
|-------|------|------|--------|
| `test:unit` | 1130 | 11 | ❌ |
| `test:integration` | 1+ | 6 | ❌ |
| `test:browser-tools` | 110 | 0 | ✅ |
| `build` | — | — | ✅ |
| `build:web-host` | — | — | ✅ |
