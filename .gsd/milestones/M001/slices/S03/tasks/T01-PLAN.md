---
estimated_steps: 5
estimated_files: 4
---

# T01: Add wizard toggle and document unique_milestone_ids across all three doc files

**Slice:** S03 — UX — wizard toggle and documentation
**Milestone:** M001

## Description

Wire the `unique_milestone_ids` preference into the wizard and document it. The field already exists in the `GSDPreferences` interface with full validation, merge, and serialization support (S01). This task adds the user-facing pieces: a wizard step so users can toggle it, and documentation so they know it exists.

## Steps

1. In `commands.ts` `handlePrefsWizard()`, insert a new section after the skill_discovery select block (after line 394) and before the serialization comment (line 396). Use `ctx.ui.select()` with options `["true", "false", "(keep current)"]`. On null (Escape), skip. On `"(keep current)"`, skip. Otherwise, set `prefs.unique_milestone_ids = choice === "true"`.
2. In `preferences-reference.md`, add a Field Guide entry for `unique_milestone_ids` after the `git` entry (around line 108). Document: boolean, default `false`, when enabled generates `M-{rand6}-{seq}` format milestone IDs to prevent collisions in team workflows. Both formats coexist.
3. In `templates/preferences.md`, add `unique_milestone_ids:` (empty/unset) in the frontmatter block, after `git` and before the closing `---`.
4. In `system.md`, add a parenthetical to the milestone dirs line (`M001/`) noting that with `unique_milestone_ids: true`, format is `M-{rand6}-{seq}/` (e.g. `M-eh88as-001/`). Keep it brief — this file is read every turn.
5. Run existing test suites to confirm no regression. Grep all 4 files to confirm additions.

## Must-Haves

- [ ] Wizard step uses `ctx.ui.select()` with 3 options: `"true"`, `"false"`, `"(keep current)"`
- [ ] Escape (null return) does not overwrite existing value
- [ ] `"(keep current)"` does not overwrite existing value
- [ ] String `"true"`/`"false"` converted to boolean before assignment
- [ ] `preferences-reference.md` has Field Guide entry for `unique_milestone_ids`
- [ ] `templates/preferences.md` includes `unique_milestone_ids:` field
- [ ] `system.md` mentions new milestone ID format

## Verification

- `npx vitest run src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts` — all 63 assertions pass
- `npx vitest run src/resources/extensions/gsd/tests/next-milestone-id.test.ts` — all 8 assertions pass
- `grep -n 'unique_milestone_ids' src/resources/extensions/gsd/commands.ts` shows wizard step (ctx.ui.select line)
- `grep -n 'unique_milestone_ids' src/resources/extensions/gsd/docs/preferences-reference.md` shows Field Guide entry
- `grep -n 'unique_milestone_ids' src/resources/extensions/gsd/templates/preferences.md` shows template field
- `grep -c 'M-{rand6}' src/resources/extensions/gsd/prompts/system.md` returns ≥1

## Inputs

- `src/resources/extensions/gsd/commands.ts` — existing `handlePrefsWizard()` with skill_discovery pattern to follow
- `src/resources/extensions/gsd/docs/preferences-reference.md` — existing Field Guide entries as style reference
- `src/resources/extensions/gsd/templates/preferences.md` — existing template structure
- `src/resources/extensions/gsd/prompts/system.md` — existing naming convention section
- S01 summary — confirms `GSDPreferences.unique_milestone_ids` exists with full validation/merge/serialization

## Expected Output

- `src/resources/extensions/gsd/commands.ts` — wizard step added for `unique_milestone_ids`
- `src/resources/extensions/gsd/docs/preferences-reference.md` — Field Guide entry added
- `src/resources/extensions/gsd/templates/preferences.md` — field added to template
- `src/resources/extensions/gsd/prompts/system.md` — parenthetical note added to naming convention

## Observability Impact

- **New wizard step:** The `handlePrefsWizard()` function now includes a `unique_milestone_ids` prompt. A future agent inspecting the wizard flow can grep for `unique_milestone_ids` in `commands.ts` to confirm the toggle exists.
- **Skip-path safety:** Null (Escape) and `"(keep current)"` both short-circuit without mutation. This is verifiable by reading the serialized output after a skip — the field should be absent if not previously set.
- **Documentation signals:** `preferences-reference.md`, `templates/preferences.md`, and `system.md` all mention `unique_milestone_ids` or `M-{rand6}`. Grep confirms presence. Absence in any file indicates a missed documentation update.
- **No new runtime logging added** — this task is purely UX (wizard UI) and static documentation. Runtime validation/merge observability was established in S01.
