---
estimated_steps: 6
estimated_files: 3
---

# T02: Round-trip fidelity tests + auto-migration hookup

**Slice:** S02 — Markdown Importers + Auto-Migration
**Milestone:** M001

## Description

Write comprehensive round-trip fidelity tests proving every artifact type imports correctly, and wire auto-migration into `startAuto()` so existing projects get silent DB creation on first run.

## Steps

1. Create `md-importer.test.ts` following the `createTestContext()` pattern from test-helpers.ts. Build fixture data: a temp directory with realistic `.gsd/` structure including DECISIONS.md (with supersession — D010 amends D001), REQUIREMENTS.md (Active, Validated, Deferred, Out of Scope sections with 3+ requirements), and hierarchy files (roadmap, plan, summary, continue, context, research, assessment, UAT under a milestone/slice, plus root PROJECT.md).

2. Test `parseDecisionsTable()` directly: assert correct field extraction from fixture DECISIONS.md, verify supersession detection (D010 amends D001 → D001.superseded_by set), verify empty/malformed rows are skipped gracefully.

3. Test `parseRequirementsSections()` directly: assert all bullet fields extracted, verify status from different sections (Active, Validated, Deferred, Out of Scope), verify full_content captures entire requirement block text.

4. Test `migrateFromMarkdown()` end-to-end: create temp .gsd/ tree, run migration, then query using existing `getDecisionById()`, `getActiveDecisions()`, `getRequirementById()`, `getActiveRequirements()`, and raw `_getAdapter()` for artifacts table. Assert: (a) decision field values match source, (b) superseded decisions excluded from active view, (c) requirement field values match source, (d) artifact paths and content match source files, (e) artifact_type correctly derived, (f) milestone_id/slice_id/task_id correctly extracted. Test idempotent re-import: run migrateFromMarkdown twice, assert same row count and values. Test missing files: create minimal .gsd/ with only DECISIONS.md, assert no crash and other importers skip cleanly. Test schema v1→v2: open a v1 DB, run migrateFromMarkdown, verify artifacts table exists.

5. Hook auto-migration into `startAuto()` in auto.ts: after the `.gsd/` bootstrap block (around line 630) and before `deriveState()` (around line 666), add detection logic: `if (existsSync(gsdDir) && !existsSync(join(gsdDir, 'gsd.db')) && hasMarkdownFiles)` → import `{ openDatabase }` from gsd-db, `{ migrateFromMarkdown }` from md-importer → `openDatabase(join(gsdDir, 'gsd.db'))` → `migrateFromMarkdown(gsdDir)` → log one-line summary to stderr. Guard with try/catch so migration failure doesn't block auto-mode (graceful degradation per D003).

6. Run `npm run test:unit` to verify all existing 283+ tests pass with zero regressions.

## Must-Haves

- [ ] Round-trip test for every field of Decision type
- [ ] Round-trip test for every field of Requirement type
- [ ] Round-trip test for hierarchy artifacts (content matches source file)
- [ ] Supersession chain test (amends detection + active view filtering)
- [ ] Idempotent re-import test (double migration = same results)
- [ ] Missing file graceful handling test
- [ ] Schema v1→v2 migration test on existing DB
- [ ] Auto-migration in startAuto() compiles and is guarded by try/catch
- [ ] All existing tests pass (0 regressions)

## Verification

- `npm run test:unit -- --test-name-pattern "md-importer"` — all assertions pass
- `npm run test:unit` — 283+ tests pass, 0 fail
- Auto-migration code in auto.ts compiles without errors

## Inputs

- `src/resources/extensions/gsd/md-importer.ts` — T01 output: all importer functions
- `src/resources/extensions/gsd/gsd-db.ts` — T01 output: schema v2, upsert wrappers
- `src/resources/extensions/gsd/tests/test-helpers.ts` — createTestContext assertion helpers
- `src/resources/extensions/gsd/auto.ts` — startAuto() hookup point (after .gsd/ bootstrap, before deriveState)
- S01 test patterns from `gsd-db.test.ts` and `context-store.test.ts` — temp dir helpers, cleanup patterns

## Expected Output

- `src/resources/extensions/gsd/tests/md-importer.test.ts` — new: comprehensive round-trip fidelity tests
- `src/resources/extensions/gsd/auto.ts` — modified: auto-migration detection + execution block added to startAuto()

## Observability Impact

- **New runtime signal:** `gsd-migrate: auto-migration failed: <message>` on stderr when auto-migration in startAuto() fails (graceful degradation — auto-mode continues)
- **Existing signals preserved:** `gsd-migrate: imported N decisions, N requirements, N artifacts` emitted when auto-migration runs successfully via migrateFromMarkdown()
- **Test inspection:** `npm run test:unit -- --test src/resources/extensions/gsd/tests/md-importer.test.ts` runs all 70 assertions for round-trip fidelity
- **DB presence check:** After first auto-mode run on a project with `.gsd/DECISIONS.md` or `.gsd/REQUIREMENTS.md`, `.gsd/gsd.db` should exist
- **Failure visibility:** Auto-migration errors are caught and logged to stderr; auto-mode proceeds without DB if migration fails
