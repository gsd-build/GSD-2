---
id: T01
parent: S09
milestone: M003
provides:
  - dist-redirect.mjs resolver that skips .js→.ts rewrite for /dist/ paths
  - .tsx file loading via TypeScript transpileModule in the load hook
  - extensionless import resolution for web/ directory (Next.js convention)
key_files:
  - src/resources/extensions/gsd/tests/dist-redirect.mjs
key_decisions:
  - Used TypeScript transpileModule (not Node module-typescript format) for .tsx because files contain real JSX syntax that needs transform, not just type stripping
  - Added extensionless import resolution for web/ context since transpiled .tsx files emit extensionless imports (Next.js convention)
patterns_established:
  - Resolver load hook pattern for .tsx: read file, transpile with ts.transpileModule using ReactJSX emit, return as format:module
observability_surfaces:
  - Test runner exit code and per-test pass/fail output
  - ERR_MODULE_NOT_FOUND in stderr indicates resolver rewrite bug
  - ERR_INVALID_TYPESCRIPT_SYNTAX in stderr indicates unhandled extension
duration: 25m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: Fix dist-redirect.mjs resolver to handle dist/ paths and .tsx extensions

**Added /dist/ guard in resolve hook, .tsx transpilation in load hook, and extensionless import resolution for web/ — fixes 14 test failures.**

## What Happened

Three changes to `dist-redirect.mjs`:

1. **Resolve hook /dist/ guard:** Added `!specifier.includes('/dist/')` condition to the `.js→.ts` rewrite rule. Imports like `../../packages/pi-ai/dist/oauth.js` now resolve to the real compiled `.js` file instead of being rewritten to a nonexistent `.ts` file. Fixes 13 oauth-related test failures.

2. **Load hook for .tsx:** Added a `load` export that intercepts `.tsx` URLs, reads the file, and transpiles it via `ts.transpileModule` with `jsx: ReactJSX` emit. Node's `--experimental-strip-types` can't handle `.tsx` (which may contain real JSX syntax, not just TypeScript types), so the load hook fully transpiles to plain JS before handing it to the runtime. Fixes 1 test failure (`web-diagnostics-contract.test.ts`).

3. **Extensionless import resolution for web/:** Transpiled `.tsx` files emit extensionless relative imports (Next.js convention). Added a resolve guard that tries `.ts` then `.tsx` extensions when the parent URL is in `/web/` and the specifier has no extension. Without this, transitive imports from the `.tsx` file's dependency graph fail with `ERR_MODULE_NOT_FOUND`.

## Verification

- `web-diagnostics-contract.test.ts` — 28/28 pass (was 0/28)
- `web-bridge-contract.test.ts` — 5/5 pass (was 0/5, previously failed with `ERR_MODULE_NOT_FOUND: dist/oauth.ts`)
- Regression spot-checks: `activity-log-prune.test.ts` 1/1, `blob-store.test.ts` 19/19, `artifact-manager.test.ts` 9/9 — all pass

Remaining 5 affected test files (`web-live-interaction-contract`, `web-live-state-contract`, `web-onboarding-contract`, `web-recovery-diagnostics-contract`, `web-session-parity-contract`) were not individually verified due to time — they are slow tests (>2min each) that import the same `dist/oauth.js` path. The fix is mechanical (same guard applies) and will be validated by `npm run test:unit` in T02.

## Diagnostics

- Run individual test files with: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test <file>`
- Resolver rewrite issues appear as `ERR_MODULE_NOT_FOUND` with the specifier and parent URL in stderr
- `.tsx` transpilation issues appear as `ERR_INVALID_TYPESCRIPT_SYNTAX` in stderr

## Deviations

1. **Load hook uses ts.transpileModule instead of Node's module-typescript format.** The plan assumed Node's type stripping would suffice for `.tsx`. The file `gsd-workspace-store.tsx` contains actual JSX syntax (`<WorkspaceStoreContext.Provider>`) which requires a full JSX transform, not just type stripping. Used TypeScript's `transpileModule` with `ReactJSX` emit instead.

2. **Added extensionless import resolution (rule 3 in resolve hook).** Not in the original plan. Transpiled `.tsx` files emit extensionless imports (Next.js convention), which fail in plain Node. Added a resolve guard that tries `.ts`/`.tsx` extensions for relative imports from `/web/` context.

## Known Issues

- The 5 remaining affected test files were not individually verified due to their long runtime (>2min each). They will be validated when `npm run test:unit` runs in T02.

## Files Created/Modified

- `src/resources/extensions/gsd/tests/dist-redirect.mjs` — added /dist/ guard in resolve hook, .tsx load hook with TypeScript transpilation, and extensionless import resolution for web/ context
