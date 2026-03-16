---
estimated_steps: 9
estimated_files: 35
---

# T01: Execute merge and resolve trivial + mechanical conflicts

**Slice:** S01 — Upstream merge and build stabilization
**Milestone:** M003

## Description

Initiate `git merge upstream/main` and resolve ~35 of the 50 conflicted files that require minimal judgment. This covers: take-upstream files (native packages, changelog, gitignore, native-git-bridge.ts, post-unit-hooks.ts, git.rs), delete-file conflicts (orphaned-branch.test.ts), mechanical merges (package.json, ci.yml, env-api-keys.ts, settings-manager.ts, editor.ts), prompt files (7 .md files where both sides made additive changes), and test files (11 files — take upstream). After this task, only the GSD extension core modules and CLI entry points remain conflicted.

## Steps

1. **Fetch upstream and start the merge:**
   ```bash
   git fetch upstream
   git merge upstream/main
   ```
   This will fail with conflict markers in 50 files. That's expected.

2. **Batch take-upstream for files where upstream is a strict superset:**
   ```bash
   git checkout upstream/main -- .gitignore CHANGELOG.md \
     native/crates/engine/src/git.rs \
     native/npm/darwin-arm64/package.json \
     native/npm/darwin-x64/package.json \
     native/npm/linux-arm64-gnu/package.json \
     native/npm/linux-x64-gnu/package.json \
     native/npm/win32-x64-msvc/package.json \
     src/resources/extensions/gsd/native-git-bridge.ts \
     src/resources/extensions/gsd/post-unit-hooks.ts
   ```

3. **Handle the delete/modify conflict:**
   ```bash
   git rm src/resources/extensions/gsd/tests/orphaned-branch.test.ts
   ```
   Upstream deleted this file. Accept the deletion.

4. **Delete package-lock.json — it will be regenerated in T04:**
   ```bash
   rm package-lock.json
   git add package-lock.json
   ```
   Never manually resolve a lockfile. T04 will `npm install` to regenerate it.

5. **Resolve package.json — merge both sides' additions:**
   Open the conflicted `package.json`. For each conflict hunk:
   - **Dependencies / devDependencies:** Include packages from BOTH sides. Upstream added new deps; fork added web-related deps (`next`, `react`, `@types/react`, etc.). Keep all.
   - **Scripts:** Keep ALL fork scripts (especially `stage:web-host`, `gsd`, `gsd:web`, `build:web-host`, `dev:web-host`). Keep ALL upstream scripts. If both sides added different scripts, include all.
   - **Version field:** Take upstream's version.
   - **Other fields (name, type, exports, etc.):** Take upstream's version, but preserve any fork-only fields.
   After resolving, `git add package.json`.

6. **Resolve CI workflow — combine both sides' steps:**
   Open `.github/workflows/ci.yml`. Fork added web build steps; upstream added new test steps. Both are additive — include all steps from both sides. If there are structural conflicts at list boundaries, combine them cleanly. Ensure the fork's web-host build step is preserved.
   After resolving, `git add .github/workflows/ci.yml`.

7. **Resolve packages/ conflicts (3 files):**
   - `packages/pi-ai/src/env-api-keys.ts` — Both sides added different env key entries. Include keys from both sides.
   - `packages/pi-coding-agent/src/core/settings-manager.ts` — Both sides likely made additive changes. Combine them.
   - `packages/pi-tui/src/components/editor.ts` — Both sides changed editor behavior. Read both versions and merge logically.
   After each: `git add <file>`.

8. **Resolve prompt files (7 .md files) — both sides made additive content changes:**
   Files:
   - `src/resources/extensions/gsd/prompts/execute-task.md`
   - `src/resources/extensions/gsd/prompts/guided-complete-slice.md`
   - `src/resources/extensions/gsd/prompts/guided-plan-milestone.md`
   - `src/resources/extensions/gsd/prompts/guided-research-slice.md`
   - `src/resources/extensions/gsd/prompts/queue.md`
   - `src/resources/extensions/gsd/prompts/research-milestone.md`
   - `src/resources/extensions/gsd/prompts/research-slice.md`
   For each: both sides added prompt content. Include content from both. Take upstream as the base and add any fork-only additions back. When in doubt, take upstream — these are prompt templates and upstream's version is more current.
   After each: `git add <file>`.

9. **Resolve test files (11 files) — take upstream:**
   Take upstream for all test files. Upstream rewrote tests to match new APIs. Fork-specific web tests are in separate files that don't conflict.
   ```bash
   git checkout upstream/main -- \
     src/resources/extensions/gsd/tests/complete-milestone.test.ts \
     src/resources/extensions/gsd/tests/draft-promotion.test.ts \
     src/resources/extensions/gsd/tests/git-service.test.ts \
     src/resources/extensions/gsd/tests/idle-recovery.test.ts \
     src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts \
     src/resources/extensions/gsd/tests/post-unit-hooks.test.ts \
     src/resources/extensions/gsd/tests/preferences-hooks.test.ts \
     src/resources/extensions/gsd/tests/resolve-ts-hooks.mjs \
     src/resources/extensions/gsd/tests/unit-runtime.test.ts \
     src/resources/extensions/gsd/tests/worktree-integration.test.ts \
     src/resources/extensions/gsd/tests/worktree.test.ts \
     src/tests/integration/pack-install.test.ts \
     src/tests/app-smoke.test.ts
   ```

## Must-Haves

- [ ] `git merge upstream/main` is initiated (merge in progress or completed for this batch)
- [ ] package.json has BOTH fork's web scripts and upstream's new deps — nothing from either side is lost
- [ ] package-lock.json is deleted (not manually resolved)
- [ ] orphaned-branch.test.ts is deleted (accept upstream deletion)
- [ ] native-git-bridge.ts and post-unit-hooks.ts are taken from upstream (superset versions)
- [ ] All 7 prompt files resolved with content from both sides
- [ ] All test files taken from upstream
- [ ] ci.yml has both fork's web build steps and upstream's new test steps

## Verification

- `rg "<<<<<<|>>>>>>|======" .github/ native/ packages/ CHANGELOG.md .gitignore package.json src/resources/extensions/gsd/prompts/ src/resources/extensions/gsd/tests/ src/tests/ src/resources/extensions/gsd/native-git-bridge.ts src/resources/extensions/gsd/post-unit-hooks.ts` → empty
- `grep "build:web-host" package.json` → confirms fork's web build script preserved
- `grep "stage:web-host" package.json` → confirms fork's staging script preserved
- The remaining conflicted files should only be the GSD extension core modules (auto.ts, index.ts, commands.ts, state.ts, preferences.ts, types.ts, git-service.ts) and CLI entry points (cli.ts, loader.ts, onboarding.ts) and remaining extension modules (files.ts, activity-log.ts, dashboard-overlay.ts, guided-flow.ts, worktree-manager.ts)

## Inputs

- Clean `main` branch at commit `587ec3f`
- `upstream` remote pointing to `gsd-build/gsd-2`
- Research doc identifying all 50 conflicted files and their resolution strategy

## Expected Output

- Merge in progress with ~35 of 50 files resolved
- ~15 files still have conflict markers (GSD extension source + CLI entry points)
- `package-lock.json` deleted pending regeneration
- All resolved files staged with `git add`
