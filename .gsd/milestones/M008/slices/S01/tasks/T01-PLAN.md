---
estimated_steps: 5
estimated_files: 2
---

# T01: Extend project discovery service with progress data from STATE.md

**Slice:** S01 — Projects Page Redesign
**Milestone:** M008

## Description

Add a `ProjectProgressInfo` type and a `readProjectProgress()` function to the project discovery service that parses each project's `.gsd/STATE.md` for active milestone name, active slice name, phase, and milestone completion tally (completed vs total). Extend `discoverProjects()` with an optional `includeProgress` parameter. Update the `/api/projects` route to accept `?detail=true` and pass it through.

All I/O must remain synchronous (`readFileSync`) to match the existing service pattern. STATE.md parsing must be defensive — return `null` progress when the file is missing or lines don't match.

## Steps

1. In `src/web/project-discovery-service.ts`, add a `ProjectProgressInfo` interface with fields: `activeMilestone: string | null`, `activeSlice: string | null`, `phase: string | null`, `milestonesCompleted: number`, `milestonesTotal: number`.
2. Add an optional `progress?: ProjectProgressInfo` field to the existing `ProjectMetadata` interface.
3. Implement `readProjectProgress(projectPath: string): ProjectProgressInfo | null`:
   - Try `readFileSync(join(projectPath, '.gsd', 'STATE.md'), 'utf-8')`.
   - Parse `**Active Milestone:**` line → extract value after colon, trim.
   - Parse `**Active Slice:**` line → extract value after colon, trim.
   - Parse `**Phase:**` line → extract value after colon, trim.
   - Count lines matching `- ✅` → `milestonesCompleted`.
   - Count lines matching `- 🔄` → add to total with completed for `milestonesTotal`.
   - Return `null` on any read error (file missing, not readable).
4. Modify `discoverProjects(devRootPath: string, includeProgress?: boolean)` to call `readProjectProgress()` for each project when `includeProgress` is true, and attach the result as the `progress` field.
5. In `web/app/api/projects/route.ts`, read a `detail` query param from the URL. If `detail === "true"`, pass `true` as the second argument to `discoverProjects(root, true)`. Otherwise call as before.

## Must-Haves

- [ ] `ProjectProgressInfo` interface exported from `project-discovery-service.ts`
- [ ] `readProjectProgress` handles missing `.gsd/STATE.md` gracefully (returns null)
- [ ] `discoverProjects` signature backward-compatible (new param is optional)
- [ ] API route passes `?detail=true` through to the service
- [ ] All I/O is synchronous (readFileSync) — no async changes
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0
- `rg "ProjectProgressInfo" src/web/project-discovery-service.ts` shows the interface
- `rg "detail" web/app/api/projects/route.ts` shows the query param handling

## Inputs

- `src/web/project-discovery-service.ts` — existing `discoverProjects()`, `ProjectMetadata` interface
- `web/app/api/projects/route.ts` — existing GET handler
- STATE.md format reference (from the project's own `.gsd/STATE.md`):
  ```
  **Active Milestone:** M008: Web Polish
  **Active Slice:** S01: Projects Page Redesign
  **Phase:** planning
  ## Milestone Registry
  - ✅ **M001:** Web mode foundation
  - 🔄 **M008:** Web Polish
  ```

## Observability Impact

- **New API surface:** `/api/projects?root=...&detail=true` now returns a `progress` field on each project object. Agents and humans can inspect project state by curling this endpoint.
- **Inspection:** `readProjectProgress()` is exported and can be called directly for a single project path to check STATE.md parse results.
- **Failure state:** When `.gsd/STATE.md` is missing or unparseable, `progress` is `null` — no error thrown. Individual field parse misses yield `null` for that field (activeMilestone, activeSlice, phase) while numeric counts default to 0.
- **No new logs or metrics** — this is a synchronous read layer, not a long-running process.

## Expected Output

- `src/web/project-discovery-service.ts` — extended with `ProjectProgressInfo` interface, `readProjectProgress()` function, and `includeProgress` param on `discoverProjects()`
- `web/app/api/projects/route.ts` — reads `?detail=true` and passes through
