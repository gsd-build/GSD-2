---
estimated_steps: 5
estimated_files: 2
---

# T03: Update SKILL.md indexes and write S02 verification script

**Slice:** S02 — Test synthesis and interactive session
**Milestone:** M001

## Description

Wire the two new files from T01 and T02 into SKILL.md's indexes and routing, then write a comprehensive verification script that confirms the entire S02 deliverable is structurally correct. This task integrates the synthesis guide and workflow into the skill's discovery surface and provides the slice's objective stopping condition.

Three SKILL.md edits (~10 lines changed total):
1. Add `synthesis-guide.md` to the `<reference_index>` table
2. Change `run-uat.md` status in `<workflows_index>` from "Planned (S02)" to active
3. Remove the "Note: This workflow will be created in S02" routing caveat

The verification script must cover both new files, SKILL.md updates, content quality checks, and S01 regression.

## Steps

1. **Update `<reference_index>` in SKILL.md.** Add a row to the table for `synthesis-guide.md` with purpose: "How to synthesize individual UAT items into 2-4 experience-oriented scenarios. Covers the synthesis algorithm, worked examples of mechanical vs. holistic transformation, and anti-patterns to avoid."

2. **Update `<workflows_index>` in SKILL.md.** Change the `run-uat.md` row's Status column from "Planned (S02)" to "Active". The Purpose column stays the same.

3. **Remove the S02 routing note in SKILL.md.** In the `<routing>` section, delete the italic note that reads: "*Note: This workflow will be created in S02. Until then, the skill can explain its purpose and the targeting algorithm but cannot execute the full UAT flow.*"

4. **Write `.gsd/milestones/M001/slices/S02/scripts/verify-s02.sh`.** Use the same `check()` / `check_grep()` helper pattern established in verify-s01.sh. Checks to include:
   - File existence: `synthesis-guide.md`, `run-uat.md` (2 checks)
   - Workflow XML tags: `<required_reading>`, `<process>`, `<success_criteria>` (3 checks)
   - Workflow references: `slice-targeting.md`, `synthesis-guide.md` (2 checks)
   - Workflow severity: references all four severity levels (1 check)
   - Workflow open-ended language: contains "observe" or "observation" (1 check)
   - Workflow structured capture: contains "finding" (1 check)
   - Workflow safety: does NOT contain "activeSlice" (1 check)
   - Synthesis guide content: contains "mechanical" (1 check)
   - Synthesis guide content: contains "experience" or "holistic" (1 check)
   - Synthesis guide content: contains "example" (1 check)
   - Synthesis guide content: references Edge Cases section (1 check)
   - SKILL.md index: reference_index includes "synthesis-guide" (1 check)
   - SKILL.md index: workflows_index no longer says "Planned (S02)" (1 check)
   - SKILL.md routing: no longer has the S02 note (1 check)
   - SKILL.md line count: still under 500 (1 check)
   - S01 regression: call verify-s01.sh — must still pass (1 check)

5. **Run both verification scripts.** Execute verify-s02.sh and verify-s01.sh. Fix any failures before declaring the task done.

## Must-Haves

- [ ] SKILL.md `<reference_index>` includes synthesis-guide.md row
- [ ] SKILL.md `<workflows_index>` shows run-uat.md as "Active" (not "Planned (S02)")
- [ ] SKILL.md `<routing>` section has no S02 caveat note
- [ ] verify-s02.sh exists with 20+ checks covering files, content, indexes, and regression
- [ ] verify-s02.sh passes all checks
- [ ] verify-s01.sh still passes all 19 checks (regression)
- [ ] SKILL.md stays under 500 lines

## Verification

- `bash .gsd/milestones/M001/slices/S02/scripts/verify-s02.sh` — all S02 checks pass
- `bash .gsd/milestones/M001/slices/S01/scripts/verify-s01.sh` — all 19 S01 checks still pass
- `wc -l < ~/.gsd/agent/skills/gsd-verify-work/SKILL.md` returns < 500

## Inputs

- `~/.gsd/agent/skills/gsd-verify-work/SKILL.md` — current state with indexes to update (105 lines, produced in S01)
- `~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md` — created in T01, needs index entry
- `~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md` — created in T02, needs index status update
- `.gsd/milestones/M001/slices/S01/scripts/verify-s01.sh` — regression script to call from verify-s02.sh

## Expected Output

- `~/.gsd/agent/skills/gsd-verify-work/SKILL.md` — updated with ~10 lines changed across 3 locations (reference_index, workflows_index, routing)
- `.gsd/milestones/M001/slices/S02/scripts/verify-s02.sh` — comprehensive verification script (20+ checks)

## Observability Impact

- **New diagnostic surface:** `verify-s02.sh` provides 20 structural checks that can be re-run at any time to confirm S02 deliverables are intact. It also calls `verify-s01.sh` as a regression gate.
- **SKILL.md discoverability:** After this task, the synthesis-guide.md reference and the run-uat.md workflow are discoverable through SKILL.md's index tables. An agent reading SKILL.md will see both files listed and routable.
- **Failure detection:** If someone later breaks SKILL.md's indexes (e.g., removes the synthesis-guide row or reverts run-uat.md to "Planned"), `verify-s02.sh` catches it with explicit negative-grep checks.
