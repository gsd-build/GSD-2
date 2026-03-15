# Plan: Automated Build Verification (#470)

**Issue:** https://github.com/gsd-build/gsd-2/issues/470
**Problem:** GSD generates TypeScript code that works in dev mode but fails `tsc` production builds with 50+ type errors. Users don't discover this until they manually run a build, then must create entire milestones just to fix TS errors.

**Root Cause:** GSD has no automated build verification at any point in the workflow. The LLM is _told_ to verify builds in prompt instructions, but there's no enforcement. The `pre_merge_check` in `git-service.ts` is disabled by default and partially stubbed.

---

## Design Approach

Add a **`build_command` preference** that, when set, automatically runs after every `complete-slice` merge (the squash merge to main). If the build fails, GSD injects the error output into a **build-fix dispatch** that the LLM must resolve before auto-mode advances.

This catches TS errors at the slice boundary — early enough to fix them in context, late enough to avoid running builds after every single task.

### Why at slice merge, not per-task?
- Running builds after every task is expensive and slow
- The slice is the atomic shippable unit — if it doesn't build, it shouldn't merge
- The LLM still has full context of what it just built
- Matches the existing `pre_merge_check` intent

---

## Implementation Plan

### Slice 1: Wire up `build_command` preference + pre-merge build gate

**Files to modify:**

#### 1. `src/resources/extensions/gsd/preferences.ts`
- Add `build_command?: string | boolean` to `GSDPreferences` interface
  - `string` = explicit command (e.g., `"npm run build"`, `"tsc --noEmit"`)
  - `true` = auto-detect from package.json (`build` script)
  - `false` / undefined = disabled (backward compatible default)
- Add validation in `validatePreferences()` for the new field
- Add `resolveBuildCommand(basePath: string): string | null` helper that:
  - Returns the explicit string if set
  - If `true`, reads `package.json` and returns `npm run build` if a `build` script exists
  - Returns `null` if disabled or no build script found

#### 2. `src/resources/extensions/gsd/git-service.ts`
- Update `runPreMergeCheck()` to use `build_command` preference alongside existing `pre_merge_check`:
  - If `build_command` is set, run it as the pre-merge check
  - Keep existing `pre_merge_check` as an additional/override option
  - Return `{ passed, skipped, command, error, output }` — add `output` field for build error text
- Update `PreMergeCheckResult` interface to include `output?: string` (truncated stderr/stdout)

#### 3. `src/resources/extensions/gsd/auto.ts`
- In the merge guard section (~line 1502), after `mergeSliceToMain()` succeeds:
  - Call `runBuildCheck(basePath)`
  - If build fails:
    - **Don't revert the merge** (the code is on main now)
    - Set a `buildFixNeeded` flag with the error output
    - Dispatch a `build-fix` unit type with the error output injected into the prompt
  - If build passes: continue normally
- Add `build-fix` to the valid unit type list
- Add `build-fix` to the `describeNextUnit()` labels

#### 4. `src/resources/extensions/gsd/prompts/build-fix.md` (NEW)
```markdown
You are executing GSD auto-mode.

## UNIT: Fix Build Errors — Post-merge build verification failed

The build command `{{buildCommand}}` failed after merging slice {{sliceId}} to main.

## Build Error Output
```
{{buildOutput}}
```

Then:
1. Read the error output carefully. Identify all type errors and their locations.
2. Fix each error. Common causes:
   - Missing type annotations
   - Incorrect import paths
   - Type mismatches between interfaces
   - Missing return types
   - Unused variables (with strict noUnusedLocals)
3. After fixing, run `{{buildCommand}}` to verify all errors are resolved.
4. If errors persist, fix and re-run until the build passes.
5. Do not commit manually — the system auto-commits after this unit.

**The build MUST pass before this unit is complete.**

When done, say: "Build errors fixed."
```

### Slice 2: Enhance prompt instructions for build awareness

**Files to modify:**

#### 5. `src/resources/extensions/gsd/prompts/execute-task.md`
- Add step between current steps 6 and 7:
  - "If a `build_command` is configured in preferences, run it after implementation to catch type errors early. Fix any errors before proceeding to verification."
- Update step 10 debugging discipline:
  - Add: "For TypeScript errors: run the project's build command (`tsc --noEmit` or `npm run build`) to check for type errors across the full project, not just the file you edited."

#### 6. `src/resources/extensions/gsd/prompts/complete-slice.md`
- Add step between current steps 3 and 4:
  - "Run the project's build command (if configured) to verify the entire project compiles. Fix any type errors before proceeding. This catches cross-file type issues that individual file edits may miss."

#### 7. `src/resources/extensions/gsd/prompts/plan-slice.md`
- In the verification section guidance, add:
  - "If the project uses TypeScript, include `tsc --noEmit` or the project's build command as a verification check."

### Slice 3: Tests + documentation

**Files to modify:**

#### 8. `src/resources/extensions/gsd/tests/build-verification.test.ts` (NEW)
- Test `resolveBuildCommand()`:
  - Returns null when not configured
  - Returns explicit string when set
  - Auto-detects from package.json when `true`
  - Returns null when `true` but no build script in package.json
- Test `runPreMergeCheck()` with build_command:
  - Passes when build succeeds
  - Fails with error output when build fails
  - Skips when not configured
- Test preference validation:
  - Accepts string, boolean, undefined
  - Rejects invalid types

#### 9. `src/resources/extensions/gsd/tests/lifecycle-build-verification.test.ts` (NEW)
- Integration test: state machine + build check
  - Setup: milestone with slice, complete slice, build check passes → continues normally
  - Setup: milestone with slice, complete slice, build check fails → state reflects build-fix needed
  - Verify build-fix unit is dispatched when build fails

#### 10. Documentation
- Update README.md preferences section with `build_command` option
- Add example to preferences.md template:
  ```yaml
  # Build verification — runs after every slice merge
  # Options: "npm run build", "tsc --noEmit", true (auto-detect), false (disabled)
  build_command: "npm run build"
  ```

---

## Configuration Examples

### User's preferences.md (project-level: `.gsd/preferences.md`)
```yaml
build_command: "npm run build"
```

### Or auto-detect:
```yaml
build_command: true
```

### Or with a custom command:
```yaml
build_command: "tsc --noEmit && npm run lint"
```

---

## What This Fixes

| Before | After |
|--------|-------|
| LLM may skip running builds | Build runs automatically after every slice merge |
| 50+ TS errors discovered at deploy time | Errors caught at slice boundary, fixed in context |
| User creates "fix TS errors" milestones | Build-fix unit auto-dispatches with error output |
| `pre_merge_check` is stubbed and disabled | Fully functional build verification gate |
| No feedback loop for build failures | Error output injected into LLM prompt for targeted fixes |

## What This Doesn't Change

- Default behavior (no `build_command` set) is unchanged — fully backward compatible
- Per-task builds are NOT added (too expensive) — only at slice merge
- The LLM still gets prompt instructions about verification — this adds enforcement on top
- Existing `pre_merge_check` preference still works as before

---

## Execution Order

1. **Slice 1** (core): Preference + build gate + build-fix prompt — this is the minimum viable fix
2. **Slice 2** (prompts): Better instructions so the LLM catches errors earlier
3. **Slice 3** (quality): Tests + docs to prevent regressions

Slice 1 alone solves the user's issue. Slices 2-3 are defense-in-depth.
