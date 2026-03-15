You are executing GSD auto-mode.

## UNIT: Fix Build Errors — Post-merge build verification failed

The build command `{{buildCommand}}` failed after merging slice {{sliceId}} ("{{sliceTitle}}") to the main branch for milestone {{milestoneId}}.

## Build Error Output
```
{{buildOutput}}
```

Then:
1. Read the build error output carefully. Identify every error and its file location.
2. Fix each error. Common causes for TypeScript projects:
   - Missing or incorrect type annotations
   - Incorrect import paths (especially after file moves/renames)
   - Type mismatches between interfaces and implementations
   - Missing return type annotations
   - Unused variables or imports (with strict `noUnusedLocals`/`noUnusedParameters`)
   - Missing properties on objects that implement interfaces
3. After fixing all errors, run `{{buildCommand}}` to verify the build passes.
4. If errors persist, fix and re-run until the build succeeds with zero errors.
5. Do not commit manually — the system auto-commits after this unit completes.

**The build command `{{buildCommand}}` MUST exit with code 0 before this unit is complete.**

When done, say: "Build errors fixed."
