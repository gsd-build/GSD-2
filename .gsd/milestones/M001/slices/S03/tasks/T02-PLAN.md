---
estimated_steps: 5
estimated_files: 2
skills_used:
  - create-skill
---

# T02: Create write-results workflow and wire SKILL.md

**Slice:** S03 — Result writing and fix task generation
**Milestone:** M001

## Description

Create the `workflows/write-results.md` XML-structured workflow that picks up from `run-uat.md` Step 8's hand-off. This workflow receives confirmed findings, writes the formal S##-UAT-RESULT.md file using the template from T01, presents a review gate for the user to confirm which findings become fix tasks (R008), generates T##-PLAN.md fix tasks using the guide from T01, and summarizes what was produced.

Then make 3 surgical edits to SKILL.md to wire the new files into the skill's indexes and routing.

## Steps

1. **Read the two T01 output files** to understand the exact format contracts:
   - `~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md` — the UAT-RESULT template
   - `~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md` — the fix-task generation guide

2. **Read `~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md`** to understand the Step 7 findings table format that this workflow receives. The table format from Step 7 is: `| # | Scenario | Finding | Severity | Reproduction Context |`. This is the input to the write-results workflow.

3. **Create `~/.gsd/agent/skills/gsd-verify-work/workflows/write-results.md`** with pure XML structure. Required top-level tags: `<required_reading>`, `<process>`, `<success_criteria>`. NO markdown headings (`^#`) outside code blocks (K002). The workflow must implement these process steps:

   **Step 1: Receive confirmed findings.** Accept the findings table from `run-uat.md` Step 7/8. Verify it has the expected columns (Scenario, Finding, Severity, Reproduction Context). If the user is invoking this workflow directly (not from run-uat.md), ask for the findings.

   **Step 2: Map findings to UAT-RESULT checks table.** Transform each finding row into the checks table format: `| Check | Mode | Result | Notes |`. Mapping rules:
   - Check = Finding description
   - Mode = `human-follow-up` (always — this skill produces human-observed findings)
   - Result = severity-based: `broken` → `FAIL`, `feels-wrong` → `NEEDS-HUMAN`, `change-request` → `PASS` (noted), `observation` → `PASS` (noted)
   - Notes = Reproduction Context + severity classification

   **Step 3: Compute verdict.** Apply these rules:
   - Any `broken` finding → propose `FAIL`
   - No `broken` but any `feels-wrong` → present the situation to the user and ask whether they consider it `PASS` or `PARTIAL`
   - No `broken` and no `feels-wrong` → propose `PASS`
   - Present the proposed verdict to the user for confirmation. The user's decision is final.

   **Step 4: Write S##-UAT-RESULT.md.** Use the template from `templates/uat-result.md`. Fill in the placeholders. Write to the correct path: `.gsd/milestones/{MID}/slices/{SID}/{SID}-UAT-RESULT.md`. Show the user what will be written before writing.

   **Step 5: Review gate for fix tasks (R008).** Present all `broken` and `feels-wrong` findings. Ask the user which ones should become fix tasks. Rules from fix-task-guide.md:
   - `broken` findings are recommended as mandatory fix tasks, but user can still decline
   - `feels-wrong` findings are presented for user decision
   - `change-request` items are shown but noted as "new scope — not recommended as fix tasks"
   - `observation` items are not presented for fix task consideration

   **Step 6: Generate fix task plans.** For each user-confirmed finding, generate a T##-PLAN.md file:
   - Scan existing `tasks/` directory to find next available T## number
   - Follow the format from `references/fix-task-guide.md`
   - Each fix task includes: title referencing the finding, description linking to the UAT scenario, steps to fix, verification that the fix resolves the finding
   - Write fix tasks to `.gsd/milestones/{MID}/slices/{SID}/tasks/T{NN}-PLAN.md`

   **Step 7: Summarize.** Present a summary of everything written: the UAT-RESULT file path and verdict, the fix task file paths and titles. State whether the slice passed, failed, or is partial.

4. **Make 3 surgical edits to `~/.gsd/agent/skills/gsd-verify-work/SKILL.md`:**

   Edit 1 — Add row to `<reference_index>` table:
   ```
   | fix-task-guide.md | How to generate T##-PLAN.md fix tasks from UAT findings. Covers severity-to-action mapping, task numbering, and the review confirmation gate. |
   ```

   Edit 2 — Add row to `<workflows_index>` table:
   ```
   | write-results.md | Write UAT-RESULT file and generate fix task plans from confirmed findings | Active |
   ```

   Edit 3 — Add routing entry in `<routing>` block. After the existing run-uat.md entry, add:
   ```
   - **Write UAT results and generate fix tasks** → `workflows/write-results.md`
     After a UAT session is complete, writes the formal S##-UAT-RESULT.md file and generates T##-PLAN.md fix tasks for confirmed findings.
   ```

   Constraints: SKILL.md must stay under 500 lines after edits. No `activeSlice` text. No markdown headings in body outside code blocks.

5. **Validate** — confirm workflow has all 3 XML tags, references both template and guide files by name, contains no `activeSlice`, has no markdown headings outside code blocks. Confirm SKILL.md updates are in place and file is under 500 lines.

## Must-Haves

- [ ] Workflow has `<required_reading>`, `<process>`, and `<success_criteria>` XML tags
- [ ] Workflow `<required_reading>` references `templates/uat-result.md` and `references/fix-task-guide.md`
- [ ] Workflow implements verdict mapping: broken → FAIL, feels-wrong → user decides, clean → PASS
- [ ] Workflow implements review gate (R008): user confirms which findings become fix tasks before generation
- [ ] Workflow checks table uses `human-follow-up` as Mode column value
- [ ] Workflow generates fix tasks with collision-safe T## numbering
- [ ] No `activeSlice` in workflow or SKILL.md
- [ ] No markdown headings (`^#`) in workflow body outside code blocks
- [ ] SKILL.md reference_index contains fix-task-guide.md
- [ ] SKILL.md workflows_index contains write-results.md with Active status
- [ ] SKILL.md routing mentions write-results
- [ ] SKILL.md stays under 500 lines

## Verification

- `grep -q "required_reading" ~/.gsd/agent/skills/gsd-verify-work/workflows/write-results.md` — has required_reading tag
- `grep -q "process" ~/.gsd/agent/skills/gsd-verify-work/workflows/write-results.md` — has process tag
- `grep -q "success_criteria" ~/.gsd/agent/skills/gsd-verify-work/workflows/write-results.md` — has success_criteria tag
- `grep -q "uat-result.md" ~/.gsd/agent/skills/gsd-verify-work/workflows/write-results.md` — references template
- `grep -q "fix-task-guide" ~/.gsd/agent/skills/gsd-verify-work/workflows/write-results.md` — references guide
- `grep -q "human-follow-up" ~/.gsd/agent/skills/gsd-verify-work/workflows/write-results.md` — uses correct Mode
- `! grep -q "activeSlice" ~/.gsd/agent/skills/gsd-verify-work/workflows/write-results.md` — no activeSlice
- `grep -q "fix-task-guide" ~/.gsd/agent/skills/gsd-verify-work/SKILL.md` — SKILL.md has guide in index
- `grep -q "write-results" ~/.gsd/agent/skills/gsd-verify-work/SKILL.md` — SKILL.md has workflow in index/routing
- `test $(wc -l < ~/.gsd/agent/skills/gsd-verify-work/SKILL.md) -lt 500` — SKILL.md under 500 lines

## Inputs

- `~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md` — UAT-RESULT template created in T01 (format contract for output file)
- `~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md` — fix-task generation guide created in T01 (severity-to-action mapping)
- `~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md` — existing workflow whose Step 7 findings table format is the input to write-results
- `~/.gsd/agent/skills/gsd-verify-work/SKILL.md` — existing skill file to update (currently 104 lines)

## Expected Output

- `~/.gsd/agent/skills/gsd-verify-work/workflows/write-results.md` — XML-structured workflow implementing result writing and fix task generation
- `~/.gsd/agent/skills/gsd-verify-work/SKILL.md` — updated with fix-task-guide in reference_index, write-results in workflows_index (Active), and routing entry

## Observability Impact

- **New inspection surfaces:** `cat ~/.gsd/agent/skills/gsd-verify-work/workflows/write-results.md` shows the full workflow content. `grep -c "Step" ~/.gsd/agent/skills/gsd-verify-work/workflows/write-results.md` confirms all 7 process steps are present.
- **SKILL.md wiring verification:** `grep "write-results" ~/.gsd/agent/skills/gsd-verify-work/SKILL.md` confirms workflow appears in index and routing. `grep "fix-task-guide" ~/.gsd/agent/skills/gsd-verify-work/SKILL.md` confirms reference appears in index.
- **Failure visibility:** If the workflow file is missing or malformed, agents invoking "write UAT results" will not find a routing match in SKILL.md. `ls ~/.gsd/agent/skills/gsd-verify-work/workflows/` shows all available workflows for inspection.
- **Banned field check:** `! grep -q "activeSlice" ~/.gsd/agent/skills/gsd-verify-work/workflows/write-results.md` catches accidental inclusion of the banned field.
