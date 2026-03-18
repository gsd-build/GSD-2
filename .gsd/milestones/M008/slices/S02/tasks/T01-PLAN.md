---
estimated_steps: 5
estimated_files: 1
---

# T01: Update API route

**Slice:** S02 — Browser Update UI
**Milestone:** M008

## Description

Create `/api/update` route with GET (check for updates) and POST (trigger update) handlers.

## Steps

1. Read `src/update-check.ts` and `src/update-cmd.ts` to understand the existing update infrastructure
2. Create `web/app/api/update/route.ts` with GET handler: read the update cache file, or fetch from npm registry if stale, return `{ currentVersion, latestVersion, updateAvailable }`
3. Add POST handler: spawn `npm install -g gsd-pi@latest` as a child process (non-blocking), capture stdout/stderr, return `{ success, output, error }`
4. Use `GSD_VERSION` env var for current version, reuse `compareSemver()` from update-check.ts
5. Run `npm run build:web-host` to verify

## Must-Haves

- [ ] GET `/api/update` returns `{ currentVersion, latestVersion, updateAvailable }`
- [ ] POST `/api/update` spawns npm install and returns result
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0

## Inputs

- `src/update-check.ts` — `compareSemver()`, `readUpdateCache()`, `writeUpdateCache()`, cache file path
- `src/update-cmd.ts` — npm install logic to adapt

## Expected Output

- `web/app/api/update/route.ts` — GET + POST handlers for update check and trigger
