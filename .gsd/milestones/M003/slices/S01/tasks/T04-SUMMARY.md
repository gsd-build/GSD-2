---
id: T04
parent: S01
milestone: M003
provides:
  - npm run build exits 0 — all 5 workspace packages + main tsc compile clean
  - npm run build:web-host exits 0 — Next.js production build + standalone staging pass
  - package-lock.json regenerated from merged package.json
  - 4 TypeScript build errors fixed across 4 files
key_files:
  - packages/pi-tui/src/components/editor.ts
  - packages/pi-ai/src/web-runtime-oauth.ts
  - src/resources/extensions/gsd/paths.ts
  - src/web-mode.ts
  - package-lock.json
key_decisions:
  - "D050: Add local openBrowser() in web-mode.ts rather than exporting from onboarding.ts — avoids modifying upstream's private API"
  - "Change web-runtime-oauth.ts import from ../dist/oauth.js to ./oauth.js — eliminates circular build dependency"
patterns_established:
  - "After large merges, always rm -rf packages/*/dist/ before first build to avoid TS5055 stale .d.ts conflicts"
  - "Fork files must use source-relative imports, never ../dist/ — dist doesn't exist until build runs"
  - "Use anchored patterns for conflict marker scans: ^<<<<<<<|^>>>>>>>|^=======$ — unanchored ====== matches JS === operators"
observability_surfaces:
  - "`npm run build` exit code — non-zero indicates regression"
  - "`npm run build:web-host` exit code — non-zero indicates web host regression"
  - "`test -f package-lock.json && echo present` — lockfile must exist post-T04"
duration: ~15min
verification_result: passed
completed_at: 2026-03-16T18:15:00-04:00
blocker_discovered: false
---

# T04: Build stabilization — npm install, compile, fix TypeScript errors

**Regenerated lockfile, fixed 4 build errors (merge detritus, circular import, duplicate declarations, missing function), both `npm run build` and `npm run build:web-host` pass clean.**

## What Happened

1. **npm install** — succeeded on first attempt, regenerated `package-lock.json` from merged `package.json`. 509 packages audited, 1 moderate vulnerability (pre-existing).

2. **Build attempt 1** — failed at `@gsd/pi-tui`: `editor.ts` had 4 stale closing braces at lines 2137-2140 (merge detritus from T01 conflict resolution). Removed them.

3. **Build attempt 2** — pi-tui passed, `@gsd/pi-ai` failed with TS5055 ("Cannot write file ... would overwrite input"). Stale `.d.ts` files in `packages/*/dist/` from pre-merge builds conflicted with new compilation output. Cleaned all `packages/*/dist/` directories.

4. **Build attempt 3** — TS5055 cleared, `@gsd/pi-ai` now failed with TS2307: fork file `web-runtime-oauth.ts` imported from `../dist/oauth.js` — a circular dependency since dist was just cleaned. Changed to source-relative import `./oauth.js`.

5. **Build attempt 4** — all 5 workspace packages compiled clean. Main `tsc` found 2 issues:
   - `paths.ts` had duplicate cache declarations (lines 141-172 duplicated the upstream version at lines 21-138) — merge artifact. Removed the duplicate block.
   - `web-mode.ts` imported `openBrowser` from `onboarding.ts` but upstream doesn't export it. Added a local 6-line copy of `openBrowser()` in `web-mode.ts`.

6. **Build attempt 5** — `npm run build` exited 0. All packages + main tsc clean.

7. **npm run build:web-host** — exited 0 on first attempt. One expected warning about `@gsd/native` not resolving in the Next.js bundle (dynamic require that falls back gracefully).

8. **Merge commit** — already created by T01's auto-commit (absorbed the `git merge upstream/main`). No separate commit needed. `git log HEAD..upstream/main` returns 0 — all upstream commits are present.

## Verification

All slice-level verification checks pass:

| Check | Result |
|---|---|
| `rg "^<<<<<<<\|^>>>>>>>\|^=======$" src/ web/ packages/ .github/` | ✅ Empty — zero conflict markers |
| `npm run build` | ✅ Exit 0 |
| `npm run build:web-host` | ✅ Exit 0 |
| `git log --oneline HEAD..upstream/main \| wc -l` | ✅ 0 — all upstream commits present |
| `test -f package-lock.json` | ✅ Present |

## Diagnostics

- **Build health**: `npm run build && npm run build:web-host` — both must exit 0
- **Stale dist recovery**: If TS5055 appears after future merges, `rm -rf packages/*/dist/` then rebuild
- **@gsd/native warning**: Expected in `build:web-host` — Next.js can't resolve native Node addon, but it's guarded by try/catch at runtime
- **Lockfile integrity**: `npm ls --all 2>&1 | grep "missing"` — should return empty

## Deviations

- **No separate merge commit**: Plan step 8 called for creating a merge commit, but the T01 auto-commit already committed the merge. `git log HEAD..upstream/main` returns 0 confirming all upstream commits are integrated.
- **Fewer web code fixes than expected**: Plan anticipated breakage in `bridge-service.ts`, `git-summary-service.ts`, `gsd-workspace-store.tsx`, and `command-surface-contract.ts`. None of these needed changes — web code defines its own types rather than importing from the modified upstream modules (as established in T02's knowledge entry).

## Known Issues

- `@gsd/native` warning in web-host build — expected, not a real issue (try/catch guarded)
- 1 moderate npm vulnerability — pre-existing, not introduced by this merge

## Files Created/Modified

- `packages/pi-tui/src/components/editor.ts` — removed 4 stale closing braces (merge detritus)
- `packages/pi-ai/src/web-runtime-oauth.ts` — changed import from `../dist/oauth.js` to `./oauth.js` (circular dependency fix)
- `src/resources/extensions/gsd/paths.ts` — removed duplicate cache declaration block (lines 141-172)
- `src/web-mode.ts` — added local `openBrowser()` function, merged child_process imports
- `package-lock.json` — regenerated from merged package.json
- `.gsd/milestones/M003/slices/S01/tasks/T04-PLAN.md` — added Observability Impact section (pre-flight fix)
