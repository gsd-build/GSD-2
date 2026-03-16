---
estimated_steps: 8
estimated_files: 7
---

# T02: Resolve GSD extension core module conflicts

**Slice:** S01 — Upstream merge and build stabilization
**Milestone:** M003

## Description

Resolve the 7 hardest conflicted files — the GSD extension core modules where upstream performed structural rewrites while our fork added web-mode integrations. Strategy for each: take upstream's version as the base, then surgically re-add fork-only web-mode code. This requires reading the fork's version (saved from before the merge or via `git show`) to identify what the fork added, then diffing against upstream to find where those additions belong.

**Critical knowledge the executor needs:**
- Upstream decomposed `auto.ts` into 6 sub-modules (auto-dispatch.ts, auto-recovery.ts, auto-dashboard.ts, auto-prompts.ts, auto-supervisor.ts, auto-worktree.ts). The fork's additions to auto.ts (dispatch gap watchdog, post-unit-hooks imports) were independently implemented by upstream — do NOT re-add them.
- Upstream may have replaced per-module cache clears (`clearParseCache`, `clearPathCache`, `invalidateStateCache`) with a centralized `invalidateAllCaches()` from `cache.ts`. Check upstream's exports before re-adding fork's cache imports.
- Upstream's `formatHookStatus` lives in `post-unit-hooks.ts` now, NOT `auto.ts`. The fork imported it from `post-unit-hooks.ts` already — but if the fork also had a copy in `auto.ts`, it must NOT be re-added.

## Steps

1. **Save fork versions for reference before resolving:**
   For each of the 7 files, save the fork's version so you can identify fork-only additions:
   ```bash
   mkdir -p /tmp/fork-ref
   for f in auto.ts index.ts commands.ts state.ts preferences.ts types.ts git-service.ts; do
     git show HEAD:src/resources/extensions/gsd/$f > /tmp/fork-ref/$f 2>/dev/null || true
   done
   ```
   Note: `HEAD` during an in-progress merge still refers to the pre-merge fork commit.

2. **Resolve `auto.ts` — take upstream (this is the hardest file):**
   ```bash
   git checkout upstream/main -- src/resources/extensions/gsd/auto.ts
   ```
   Then compare fork's version (`/tmp/fork-ref/auto.ts`) against the resolved upstream version. Identify fork-only additions:
   - **Dispatch gap watchdog**: Upstream already has this (independently implemented). Do NOT re-add.
   - **Post-unit-hooks imports**: Upstream already has these. Do NOT re-add.
   - **Cache invalidation imports** (`clearParseCache`, `clearPathCache`, `invalidateStateCache`): Check if upstream still exports these individually. If upstream uses `invalidateAllCaches` from `cache.ts` instead, do NOT re-add the old imports — they won't exist. Note this for T04 (web code may need updating to use the new pattern).
   - **Any other fork-only web imports or exports**: These are the only things to re-add. The fork may have added exports used by `src/web/bridge-service.ts` or similar. Check what the fork added that upstream doesn't have.
   `git add src/resources/extensions/gsd/auto.ts`

3. **Resolve `index.ts` — take upstream + re-add web bridge hooks:**
   ```bash
   git checkout upstream/main -- src/resources/extensions/gsd/index.ts
   ```
   Diff fork version to find fork-only additions. The fork added ~62 lines of web bridge hooks (exports for web surfaces, bridge initialization). Upstream added ~397 lines (new command registrations). Take upstream's version and re-add the fork's web-specific exports/hooks that don't overlap with upstream's additions.
   `git add src/resources/extensions/gsd/index.ts`

4. **Resolve `commands.ts` — take upstream (likely superset):**
   ```bash
   git checkout upstream/main -- src/resources/extensions/gsd/commands.ts
   ```
   Fork added `hooks` subcommand. Upstream added ~15 new subcommands and likely includes hooks. Verify upstream's version has a hooks command. If not, re-add it. If upstream has it, nothing to re-add.
   `git add src/resources/extensions/gsd/commands.ts`

5. **Resolve `state.ts` — take upstream + re-add fork state fields:**
   ```bash
   git checkout upstream/main -- src/resources/extensions/gsd/state.ts
   ```
   Fork added 130+/18- lines (web state fields, bridge state). Upstream added 164+/29- (enhanced state derivation). Compare fork version to find fork-only state fields and re-add them to upstream's version.
   `git add src/resources/extensions/gsd/state.ts`

6. **Resolve `preferences.ts` — take upstream (massive rewrite):**
   ```bash
   git checkout upstream/main -- src/resources/extensions/gsd/preferences.ts
   ```
   Upstream rewrote this file (747+/133-). Fork added 232+/1-. Check if fork had web-specific preference exports or types. If so, re-add. This is likely minimal since the fork's preference additions were mostly consuming upstream's exports.
   `git add src/resources/extensions/gsd/preferences.ts`

7. **Resolve `types.ts` — take upstream + re-add fork web types:**
   ```bash
   git checkout upstream/main -- src/resources/extensions/gsd/types.ts
   ```
   Fork added ~109 lines (web types). Upstream added 179+/1-. Both are additive. Re-add any fork-only types (web-specific interfaces, web state types) that upstream doesn't have.
   `git add src/resources/extensions/gsd/types.ts`

8. **Resolve `git-service.ts` — take upstream:**
   ```bash
   git checkout upstream/main -- src/resources/extensions/gsd/git-service.ts
   ```
   Upstream massively slimmed this file (94+/476-), moving functionality to `native-git-bridge.ts`. Fork made 46+/41- changes. Check if fork had web-specific additions. Note: `src/web/git-summary-service.ts` imports from `native-git-bridge.ts`, not `git-service.ts`, so this file's resolution is low-risk for web code. Re-add fork additions if any exist.
   `git add src/resources/extensions/gsd/git-service.ts`

## Must-Haves

- [ ] `auto.ts` uses upstream's version — fork's dispatch gap watchdog and hook imports are NOT duplicated
- [ ] `index.ts` has upstream's new command registrations AND fork's web bridge hooks
- [ ] `types.ts` has upstream's new types AND fork's web-specific types
- [ ] `state.ts` has upstream's enhanced derivation AND fork's web state fields
- [ ] `git-service.ts` uses upstream's slimmed version
- [ ] All 7 files have zero conflict markers
- [ ] No duplicate exports across files (especially `formatHookStatus` must only be in `post-unit-hooks.ts`)

## Verification

- `rg "<<<<<<|>>>>>>|======" src/resources/extensions/gsd/auto.ts src/resources/extensions/gsd/index.ts src/resources/extensions/gsd/commands.ts src/resources/extensions/gsd/state.ts src/resources/extensions/gsd/preferences.ts src/resources/extensions/gsd/types.ts src/resources/extensions/gsd/git-service.ts` → empty
- `rg "formatHookStatus" src/resources/extensions/gsd/auto.ts` → no matches (it lives in post-unit-hooks.ts now)
- Fork's web bridge exports in index.ts are present (grep for key web export names)

## Inputs

- Merge in progress with these 7 files still conflicted (from T01)
- Fork's pre-merge versions accessible via `git show HEAD:src/resources/extensions/gsd/<file>` or saved to `/tmp/fork-ref/`
- Upstream's version accessible via `git checkout upstream/main -- <file>`

## Expected Output

- All 7 GSD extension core modules resolved and staged
- Fork's web-mode additions preserved on top of upstream's structural rewrites
- Notes documented (in commit message or comments) about any cache invalidation API changes that T04 needs to handle
