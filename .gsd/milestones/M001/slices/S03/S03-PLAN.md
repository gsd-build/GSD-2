# S03: UX — wizard toggle and documentation

**Goal:** `/gsd prefs wizard` includes the `unique_milestone_ids` toggle, and all three documentation files describe the feature.
**Demo:** Run `/gsd prefs wizard` and see the unique milestone IDs prompt. Check `preferences-reference.md`, `templates/preferences.md`, and `system.md` all reference `unique_milestone_ids`.

## Must-Haves

- Wizard step for `unique_milestone_ids` using `ctx.ui.select()` with `["true", "false", "(keep current)"]`
- Escape/null handling — skips without overwriting existing value
- Boolean string conversion (`=== "true"`) before assignment
- `preferences-reference.md` Field Guide entry documenting the field
- `templates/preferences.md` includes `unique_milestone_ids:` with empty default
- `system.md` parenthetical noting new-format milestone IDs when unique IDs are enabled

## Verification

- `npx vitest run src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts` — 63 assertions still pass (no regression)
- `npx vitest run src/resources/extensions/gsd/tests/next-milestone-id.test.ts` — 8 assertions still pass
- `grep -n 'unique_milestone_ids' src/resources/extensions/gsd/commands.ts` — shows wizard step present
- `grep -n 'unique_milestone_ids' src/resources/extensions/gsd/docs/preferences-reference.md` — shows Field Guide entry
- `grep -n 'unique_milestone_ids' src/resources/extensions/gsd/templates/preferences.md` — shows template field
- `grep -c 'M-{rand6}' src/resources/extensions/gsd/prompts/system.md` — returns 1+ (parenthetical note exists)

## Tasks

- [x] **T01: Add wizard toggle and document unique_milestone_ids across all three doc files** `est:20m`
  - Why: Delivers R006 (wizard toggle) and R007 (documentation) — the two requirements this slice owns
  - Files: `src/resources/extensions/gsd/commands.ts`, `src/resources/extensions/gsd/docs/preferences-reference.md`, `src/resources/extensions/gsd/templates/preferences.md`, `src/resources/extensions/gsd/prompts/system.md`
  - Do: (1) Insert wizard step after skill_discovery select block in `handlePrefsWizard()`, following the exact `ctx.ui.select()` pattern with Escape handling and boolean conversion. (2) Add Field Guide entry for `unique_milestone_ids` in preferences-reference.md after `git` section. (3) Add `unique_milestone_ids:` line to templates/preferences.md. (4) Add parenthetical note to system.md naming convention section mentioning `M-{rand6}-{seq}` format.
  - Verify: `npx vitest run src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts` passes (63 assertions), `npx vitest run src/resources/extensions/gsd/tests/next-milestone-id.test.ts` passes (8 assertions), grep confirms all 4 files contain the additions
  - Done when: All 4 files updated, both test suites pass, grep verification confirms presence in all files

## Observability / Diagnostics

- **Wizard step visibility:** Running `/gsd prefs wizard` must display the `unique_milestone_ids` prompt — visible in the select menu output. If the step is missing, the wizard completed without offering the toggle.
- **Preference persistence:** After wizard completes, `cat .gsd/preferences.md` (or `~/.gsd/preferences.md`) shows `unique_milestone_ids: true` or `unique_milestone_ids: false` in frontmatter when the user made a selection.
- **Skip behavior inspection:** When user presses Escape or selects `(keep current)`, the serialized file should NOT contain a `unique_milestone_ids` line if it wasn't previously set — confirming the skip path works.
- **Failure surface:** If the preference field is invalid (non-boolean after parse), `validatePreferences()` in S01 already strips it and logs a warning via the validation path. Grep for `unique_milestone_ids` in the serialized output to confirm presence/absence.

## Verification (failure-path)

- After selecting Escape in the wizard, confirm `unique_milestone_ids` is absent from the serialized preferences file (skip path works).
- Grep `preferences-reference.md` for `unique_milestone_ids` — absence means the doc update was missed.

## Files Likely Touched

- `src/resources/extensions/gsd/commands.ts`
- `src/resources/extensions/gsd/docs/preferences-reference.md`
- `src/resources/extensions/gsd/templates/preferences.md`
- `src/resources/extensions/gsd/prompts/system.md`
