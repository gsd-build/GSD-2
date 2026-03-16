---
estimated_steps: 8
estimated_files: 8
---

# T04: Build stabilization — npm install, compile, fix TypeScript errors

**Slice:** S01 — Upstream merge and build stabilization
**Milestone:** M003

## Description

The proof gate for S01. Regenerate `package-lock.json` from the merged `package.json`, then compile both build targets (`npm run build`, `npm run build:web-host`). Upstream's interface changes in `types.ts`, `state.ts`, `preferences.ts`, and `git-service.ts` may break web code that imports from these modules. This task fixes any TypeScript compilation errors until both builds pass, then creates the merge commit.

**Known risk areas for TypeScript errors:**
- `src/web/bridge-service.ts` — imports from `packages/pi-coding-agent/` which upstream may have changed
- `src/web/git-summary-service.ts` — imports from `native-git-bridge.ts` which upstream rewrote
- `web/src/stores/gsd-workspace-store.tsx` — defines web store types that mirror upstream interfaces
- `web/src/lib/command-surface-contract.ts` — defines command surface types that may reference upstream shapes
- Cache invalidation pattern: fork uses `clearParseCache`/`clearPathCache`/`invalidateStateCache` from individual modules; upstream may have replaced with `invalidateAllCaches` from `cache.ts`
- New upstream modules may export types that web code shadows or redefines

## Steps

1. **Regenerate lockfile:**
   ```bash
   npm install
   ```
   This creates a fresh `package-lock.json` from the merged `package.json`. If npm install fails due to dependency conflicts, fix `package.json` (version ranges, peer deps) and retry.

2. **First build attempt — capture errors:**
   ```bash
   npm run build 2>&1 | head -200
   ```
   The `build` script likely builds packages in order (pi-tui → pi-ai → pi-agent-core → pi-coding-agent → main tsc). Capture the first batch of errors. If the build hangs or fails at a package level, that package needs fixing first.

3. **Fix TypeScript errors in main source (`src/`):**
   Common fixes needed:
   - **Import path resolution:** Upstream may have moved/renamed exports. Update import paths in fork files.
   - **Type mismatches:** Upstream changed interfaces. Update fork code to match new shapes.
   - **Missing exports:** If upstream removed exports that fork code uses, find the new location or add re-exports.
   - **Cache API changes:** If upstream replaced individual cache clears with `invalidateAllCaches`, update any fork code that calls the old functions. Check `src/resources/extensions/gsd/cache.ts` for the new API.
   
   **Do NOT change upstream's code to match the fork.** Always adapt fork code to upstream's new interfaces.

4. **Fix TypeScript errors in web source (`src/web/`, `web/`):**
   Common fixes:
   - `src/web/bridge-service.ts` — update imports if upstream changed `packages/pi-coding-agent/` exports
   - `src/web/git-summary-service.ts` — update if `native-git-bridge.ts` exports changed (upstream's version is now 1017 lines with 15+ exports vs fork's 181 lines with 8)
   - `web/src/stores/gsd-workspace-store.tsx` — update type definitions if upstream changed state/type interfaces
   - `web/src/lib/command-surface-contract.ts` — update if surface type shapes changed
   
   The web code has its OWN type definitions in many cases (not direct imports from extension code), so breakage may be minimal. But `bridge-service.ts` and `git-summary-service.ts` DO import from upstream modules.

5. **Re-run build until clean:**
   ```bash
   npm run build
   ```
   Iterate: read errors → fix → rebuild. Each cycle should fix a batch of errors. Stop when exit 0.

6. **Web host build:**
   ```bash
   npm run build:web-host
   ```
   This builds the Next.js web host. Capture errors. Fix any Next.js-specific build issues (page components, API routes, missing imports). Re-run until exit 0.

7. **Final verification sweep:**
   ```bash
   rg "<<<<<<|>>>>>>|======" . -g '!node_modules' -g '!.git'
   npm run build
   npm run build:web-host
   git log --oneline HEAD..upstream/main 2>/dev/null | wc -l
   ```
   All must pass: zero markers, both builds exit 0, zero remaining upstream commits.

8. **Create the merge commit:**
   ```bash
   git add -A
   git commit -m "merge: upstream v2.12→v2.21 (398 commits, 50 conflicts resolved)

   - Merged all upstream commits from gsd-build/gsd-2 main
   - Resolved 50 file conflicts using take-upstream + re-apply-fork strategy
   - Preserved fork's web-mode code paths (cli-web-branch, web-mode, bridge-service)
   - Regenerated package-lock.json
   - Both npm run build and npm run build:web-host pass clean"
   ```

## Must-Haves

- [ ] `npm install` succeeds and `package-lock.json` is regenerated
- [ ] `npm run build` exits 0
- [ ] `npm run build:web-host` exits 0
- [ ] Zero conflict markers in the entire repository
- [ ] All upstream commits present (`git log HEAD..upstream/main` is empty)
- [ ] Merge commit is created

## Verification

- `npm run build` → exit 0
- `npm run build:web-host` → exit 0
- `rg "<<<<<<|>>>>>>|======" . -g '!node_modules' -g '!.git'` → empty
- `git log --oneline HEAD..upstream/main | wc -l` → 0

## Inputs

- All 50 conflicts resolved and staged (from T01, T02, T03)
- `package-lock.json` deleted (will be regenerated)
- Fork's web code may have broken imports due to upstream interface changes

## Expected Output

- `package-lock.json` — regenerated from merged package.json
- Any web source files fixed for TypeScript compatibility — exact files depend on what errors appear
- Merge commit on `main` branch incorporating all 398 upstream commits
- Both `npm run build` and `npm run build:web-host` exit 0

## Observability Impact

- **Build health:** `npm run build && npm run build:web-host` — both must exit 0. Non-zero indicates a regression introduced after this task.
- **Lockfile integrity:** `test -f package-lock.json && echo "present"` — must be present. If absent, `npm install` was not run or lockfile was deleted.
- **Conflict markers:** `rg "^<<<<<<<|^>>>>>>>|^=======$" . -g '!node_modules' -g '!.git'` — must return empty. Any matches indicate an incomplete merge.
- **Upstream delta:** `git log --oneline HEAD..upstream/main | wc -l` — must be 0. Non-zero means upstream commits are missing.
- **Stale dist artifacts:** If `npm run build` fails with TS5055 ("Cannot write file ... would overwrite input"), clean `packages/*/dist/` and rebuild.
