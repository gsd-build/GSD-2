---
estimated_steps: 5
estimated_files: 2
skills_used:
  - create-skill
---

# T01: Create UAT-RESULT template and fix-task reference guide

**Slice:** S03 — Result writing and fix task generation
**Milestone:** M001

## Description

Create the two format-contract files that everything else in S03 references. The UAT-RESULT template (`templates/uat-result.md`) defines the exact format for `S##-UAT-RESULT.md` files — it must match the authoritative format from the GSD dispatch system. The fix-task guide (`references/fix-task-guide.md`) documents how to transform UAT findings into `T##-PLAN.md` fix tasks, covering all four severity levels and the task numbering collision-avoidance algorithm.

Both files are standalone — they don't reference each other. But the workflow (T02) will reference both in its `<required_reading>`, so they must exist first.

## Steps

1. **Read the authoritative UAT-RESULT format** from `src/resources/extensions/gsd/prompts/run-uat.md`. The format is in the code block near the bottom — YAML frontmatter with `sliceId`, `uatType`, `verdict`, `date`, followed by markdown body with `## Checks` table (`| Check | Mode | Result | Notes |`), `## Overall Verdict`, and `## Notes` sections.

2. **Create `~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md`** using `{{placeholder}}` syntax (not filled-in examples). The template must include:
   - YAML frontmatter: `sliceId: {{sliceId}}`, `uatType: human-experience` (hardcoded — this skill always produces human-experience results), `verdict: {{verdict}}` (PASS/FAIL/PARTIAL), `date: {{isoDate}}`
   - `# UAT Result — {{sliceId}}` heading
   - `## Checks` section with the table format: `| Check | Mode | Result | Notes |` where Mode is always `human-follow-up` for this skill's output
   - `## Overall Verdict` section with `{{verdict}} — {{verdictSummary}}` format
   - `## Notes` section for additional context
   - Brief instructions/comments explaining how to fill each section (this is a template read by agents at runtime)

3. **Read the authoritative T##-PLAN.md format** from `src/resources/extensions/gsd/templates/task-plan.md`. Note the YAML frontmatter (`estimated_steps`, `estimated_files`, `skills_used`), and body sections (Description, Steps, Must-Haves, Verification, Inputs, Expected Output).

4. **Create `~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md`** as a markdown reference file (not XML — K005 convention). Must include:
   - **Severity-to-action mapping** — explicit rules for each level:
     - `broken` → mandatory fix task (always generated)
     - `feels-wrong` → fix task only if user confirms during review gate
     - `change-request` → logged in UAT-RESULT notes, NOT auto-tasked (new scope must go through proper planning)
     - `observation` → never tasked (informational only)
   - **Task numbering** — algorithm to avoid T## ID collisions: scan existing `tasks/` directory for the slice, find the highest T## number, start fix tasks from T(N+1)
   - **Task plan format** — reference the T##-PLAN.md template structure. Each fix task must have: descriptive title referencing the finding, description linking back to the UAT scenario and finding, concrete steps to fix the issue, verification that the fix resolves the finding
   - **Review confirmation** — fix tasks are ONLY generated after the user has reviewed and confirmed which findings should become tasks (R008 requirement)
   - **Scope boundaries** — fix tasks address the specific finding, not adjacent improvements. One fix task per finding (don't combine unrelated findings).

5. **Validate both files** — confirm no `activeSlice` text in either file, template contains all required YAML fields and table structure, guide covers all 4 severity levels.

## Must-Haves

- [ ] Template YAML frontmatter contains `sliceId`, `uatType: human-experience`, `verdict`, `date` fields
- [ ] Template body has `## Checks` table with `| Check | Mode | Result | Notes |` format
- [ ] Template body has `## Overall Verdict` and `## Notes` sections
- [ ] Template uses `{{placeholder}}` syntax, not filled-in example data
- [ ] Fix-task guide covers all 4 severity levels (broken, feels-wrong, change-request, observation) with explicit task generation rules
- [ ] Fix-task guide references the T##-PLAN.md format structure
- [ ] Fix-task guide documents task numbering collision avoidance
- [ ] Fix-task guide requires user confirmation before task generation (R008)
- [ ] Neither file contains `activeSlice`

## Verification

- `test -f ~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md` — template exists
- `test -f ~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md` — guide exists
- `grep -q "sliceId" ~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md` — template has sliceId
- `grep -q "uatType" ~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md` — template has uatType
- `grep -q "verdict" ~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md` — template has verdict
- `grep -q "## Checks" ~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md` — template has checks section
- `grep -q "## Overall Verdict" ~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md` — template has verdict section
- `grep -q "broken" ~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md` — guide covers broken
- `grep -q "feels-wrong" ~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md` — guide covers feels-wrong
- `grep -q "change-request" ~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md` — guide covers change-request
- `grep -q "observation" ~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md` — guide covers observation
- `! grep -q "activeSlice" ~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md` — no activeSlice in template
- `! grep -q "activeSlice" ~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md` — no activeSlice in guide

## Observability Impact

- Signals added/changed: None — both files are static format-contract documents, not runtime code. Their correctness is verified structurally.
- How a future agent inspects this: `cat ~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md` to see the UAT-RESULT format; `cat ~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md` to see fix-task generation rules. `grep -c "{{" templates/uat-result.md` confirms placeholder count.
- Failure state exposed: If either file is missing or malformed, downstream T02 workflow will fail at `<required_reading>` load time with a file-not-found error. The `verify-s03.sh` script catches format issues before runtime.

## Inputs

- `src/resources/extensions/gsd/prompts/run-uat.md` — authoritative UAT-RESULT format (the code block near the bottom defines the exact YAML frontmatter and markdown body structure)
- `src/resources/extensions/gsd/templates/task-plan.md` — authoritative T##-PLAN.md format (YAML frontmatter + Description/Steps/Must-Haves/Verification/Inputs/Expected Output sections)
- `~/.gsd/agent/skills/gsd-verify-work/SKILL.md` — severity model defined in `<essential_principles>` (broken/feels-wrong/change-request/observation)

## Expected Output

- `~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md` — UAT-RESULT output template with {{placeholder}} syntax matching GSD dispatch format
- `~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md` — reference guide for generating fix tasks from UAT findings, covering all 4 severity levels
