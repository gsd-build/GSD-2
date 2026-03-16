# Quick Task: Fix web mode boot failure (HTTP 500)

**Date:** 2026-03-16
**Branch:** gsd/quick/1-fix-this-issue-sn0w-andrews-macbook-air

## What Changed
- Removed duplicate "Parse Cache" block in `src/resources/extensions/gsd/files.ts` (merge artifact from M003/S01)
- The duplicate declared `const CACHE_MAX`, `function cacheKey`, `const _parseCache`, `function cachedParse`, and `export function clearParseCache` a second time
- Node's `--experimental-strip-types` loaded the file and threw `SyntaxError: Identifier 'CACHE_MAX' has already been declared`
- This caused the workspace index and auto dashboard subprocesses to fail, making `/api/boot` return 500
- The `waitForBootReady` loop polled for 180s then reported `boot-ready:http 500`

## Files Modified
- `src/resources/extensions/gsd/files.ts` — removed 28-line duplicate parse cache block (kept the newer version with mid-sample cache key)

## Verification
- Started standalone server manually, confirmed `/api/boot` returns HTTP 200 with valid JSON payload
- Ran full `npm run gsd:web` flow — confirmed `status=started` and `Ready →` output
- Confirmed `npm run gsd:web:stop:all` cleans up correctly
