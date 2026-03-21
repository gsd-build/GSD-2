# S03: Result writing and fix task generation

**Goal:** After UAT session completes, skill writes S##-UAT-RESULT.md in GSD-compatible format and generates T##-PLAN.md fix tasks for confirmed findings.
**Demo:** Running the full skill flow produces a correctly-formatted UAT-RESULT file that downstream GSD auto-mode can parse, and any broken/feels-wrong findings become fix task plans ready for execution.

## Must-Haves

- UAT-RESULT template uses `{{placeholder}}` syntax matching the authoritative format from `src/resources/extensions/gsd/prompts/run-uat.md` (YAML frontmatter with sliceId, uatType, verdict, date; checks table with Mode column using `human-follow-up`; overall verdict; notes section)
- Fix-task guide covers all 4 severity levels with explicit rules: broken → mandatory fix task, feels-wrong → user-confirmed fix task, change-request → logged not auto-tasked, observation → never tasked
- Write-results workflow uses XML structure (`<required_reading>`, `<process>`, `<success_criteria>`), receives findings from run-uat.md Step 8, maps severity to verdict (any broken → FAIL, otherwise user decides PASS/PARTIAL), implements review gate before fix task generation (R008)
- Fix tasks follow the T##-PLAN.md format from `src/resources/extensions/gsd/templates/task-plan.md` with auto-incrementing IDs that avoid collisions with existing tasks
- SKILL.md updated: fix-task-guide.md in reference_index, write-results.md Active in workflows_index, routing entry for write-results
- No `activeSlice` text in any new file
- No markdown headings (`^#`) in workflow file outside code blocks

## Proof Level

- This slice proves: integration (output format compatibility with GSD auto-mode)
- Real runtime required: no (structural proof that formats match; runtime proof deferred to UAT of this milestone)
- Human/UAT required: no (format correctness is mechanically verifiable)

## Verification

- `bash .gsd/milestones/M001/slices/S03/scripts/verify-s03.sh` — ~23 structural checks covering file existence, template format, workflow structure, fix-task guide content, SKILL.md updates, cross-reference integrity, and S01/S02 regression
- `! grep -q "activeSlice" ~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md && ! grep -q "activeSlice" ~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md` — failure-path: banned field absent from new files

## Integration Closure

- Upstream surfaces consumed: `workflows/run-uat.md` Step 7 findings table format (markdown table with Scenario, Finding, Severity, Reproduction Context columns), SKILL.md severity model, `src/resources/extensions/gsd/prompts/run-uat.md` UAT-RESULT format, `src/resources/extensions/gsd/templates/task-plan.md` fix task format
- New wiring introduced in this slice: SKILL.md routing entry for write-results workflow, index entries for new reference and workflow files
- What remains before the milestone is truly usable end-to-end: nothing — S03 is the terminal slice, completing the full skill flow

## Tasks

- [x] **T01: Create UAT-RESULT template and fix-task reference guide** `est:25m`
  - Why: These two files define the output format contracts — everything else references them. The template defines what S##-UAT-RESULT.md looks like; the guide defines how findings become T##-PLAN.md fix tasks.
  - Files: `~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md`, `~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md`
  - Do: Read the authoritative UAT-RESULT format from `src/resources/extensions/gsd/prompts/run-uat.md` and create a template with `{{placeholder}}` syntax. Read the T##-PLAN.md format from `src/resources/extensions/gsd/templates/task-plan.md` and write a reference guide covering severity-to-action mapping, task numbering (check existing T## files to avoid collisions), and the review confirmation requirement. Both files must avoid `activeSlice`. Template uses markdown. Guide uses markdown (K005 — reference files use markdown).
  - Verify: `test -f ~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md && test -f ~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md && grep -q "sliceId" ~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md && grep -q "verdict" ~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md && grep -q "broken" ~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md`
  - Done when: Both files exist, template contains all required YAML fields and checks table structure, guide covers all 4 severity levels with explicit task generation rules

- [x] **T02: Create write-results workflow and wire SKILL.md** `est:25m`
  - Why: The workflow implements the end-to-end result-writing flow — receiving confirmed findings, writing UAT-RESULT using the template, presenting the review gate (R008), and generating fix tasks using the guide. SKILL.md wiring makes it discoverable.
  - Files: `~/.gsd/agent/skills/gsd-verify-work/workflows/write-results.md`, `~/.gsd/agent/skills/gsd-verify-work/SKILL.md`
  - Do: Create XML-structured workflow with `<required_reading>` (pointing to template and fix-task-guide), `<process>` (7 steps: receive findings, map to checks table, compute verdict, write UAT-RESULT, present review gate, generate fix tasks, summarize), `<success_criteria>`. The verdict logic: any broken → FAIL, no broken but feels-wrong → user decides PASS/PARTIAL, all clean → PASS. Check table Mode column must use `human-follow-up`. Fix task IDs must check existing `tasks/` directory for next available T## number. Then make 3 surgical edits to SKILL.md: add fix-task-guide.md row to `<reference_index>`, add write-results.md Active row to `<workflows_index>`, add write-results routing entry in `<routing>`. No markdown headings in workflow body outside code blocks. No `activeSlice` in either file. SKILL.md must stay under 500 lines.
  - Verify: `grep -q "required_reading" ~/.gsd/agent/skills/gsd-verify-work/workflows/write-results.md && grep -q "fix-task-guide" ~/.gsd/agent/skills/gsd-verify-work/SKILL.md && grep -q "write-results" ~/.gsd/agent/skills/gsd-verify-work/SKILL.md`
  - Done when: Workflow has XML structure with all 3 required tags, references both template and guide, implements review gate. SKILL.md has all 3 updates and stays under 500 lines.

- [x] **T03: Write verification script and run full validation** `est:15m`
  - Why: Proves all S03 deliverables are structurally correct and S01/S02 haven't regressed. This is the slice's objective stopping condition.
  - Files: `.gsd/milestones/M001/slices/S03/scripts/verify-s03.sh`
  - Do: Write a bash verification script following the pattern from S01/S02 scripts (exit-on-first-failure, check/check_grep/check_no_grep helpers). Check: file existence (3), template format (4 — YAML frontmatter fields, checks table, overall verdict section), workflow structure (4 — XML tags, references to template and guide), fix-task guide content (3 — severity levels, T##-PLAN reference, review/confirmation), SKILL.md updates (3 — reference_index, workflows_index, routing), SKILL.md line count (<500), cross-reference integrity (2 — workflow references template and guide by name), no-activeSlice (3 — in all new files), no-markdown-headings in workflow (1 — awk check outside code blocks), S01 and S02 regression (2 — call both verify scripts). Then run the script and confirm all checks pass.
  - Verify: `bash .gsd/milestones/M001/slices/S03/scripts/verify-s03.sh`
  - Done when: All ~23 checks pass including S01/S02 regression

## Observability / Diagnostics

- **Runtime signals:** Template and guide are static files — no runtime signals. Structural correctness is verified via the `verify-s03.sh` script which outputs per-check PASS/FAIL lines.
- **Inspection surfaces:** `ls ~/.gsd/agent/skills/gsd-verify-work/{templates,references,workflows}/` shows all skill assets. `grep -c "{{" ~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md` confirms placeholder count. `grep "broken\|feels-wrong\|change-request\|observation" ~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md` confirms severity coverage.
- **Failure visibility:** `verify-s03.sh` exits on first failure with the failing check name printed to stderr. Missing files, wrong formats, or missing severity levels produce explicit error messages.
- **Failure-path verification check:** The verification script includes `! grep -q "activeSlice"` checks on all new files — this is a diagnostic-style check that catches the most common authoring error (referencing the banned field).
- **Redaction constraints:** None — all files are static documentation with no secrets.

## Files Likely Touched

- `~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md`
- `~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md`
- `~/.gsd/agent/skills/gsd-verify-work/workflows/write-results.md`
- `~/.gsd/agent/skills/gsd-verify-work/SKILL.md`
- `.gsd/milestones/M001/slices/S03/scripts/verify-s03.sh`
