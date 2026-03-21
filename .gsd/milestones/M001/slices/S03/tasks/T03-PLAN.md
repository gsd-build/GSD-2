---
estimated_steps: 3
estimated_files: 1
skills_used: []
---

# T03: Write verification script and run full validation

**Slice:** S03 — Result writing and fix task generation
**Milestone:** M001

## Description

Write the S03 structural verification script following the established pattern from S01/S02 (exit-on-first-failure, check/check_grep/check_no_grep helpers). The script validates all S03 deliverables — template format, workflow structure, fix-task guide content, SKILL.md updates, cross-reference integrity, forbidden patterns — plus S01 and S02 regression. Then run it and confirm all checks pass.

## Steps

1. **Read the S02 verification script** at `.gsd/milestones/M001/slices/S02/scripts/verify-s02.sh` to follow the established pattern. Key conventions:
   - Uses `set -euo pipefail`
   - Defines `check()`, `check_grep()`, `check_no_grep()` helpers
   - Exit-on-first-failure (K003 — cascading failures make collect-all misleading)
   - Resolves sibling slice verify scripts via `SCRIPT_DIR`-relative paths
   - Reports `PASS_COUNT` at the end

2. **Create `.gsd/milestones/M001/slices/S03/scripts/verify-s03.sh`** with these checks (~23 total):

   **File existence (3):**
   - `templates/uat-result.md` exists
   - `references/fix-task-guide.md` exists
   - `workflows/write-results.md` exists

   **Template format (4):**
   - Contains `sliceId` (YAML field)
   - Contains `uatType` (YAML field)
   - Contains `verdict` (YAML field)
   - Contains `## Checks` (table section)

   **Workflow structure (4):**
   - Contains `required_reading` tag
   - Contains `process` tag
   - Contains `success_criteria` tag
   - Contains `human-follow-up` (correct Mode value)

   **Workflow references (2):**
   - References `uat-result.md` (template)
   - References `fix-task-guide` (guide)

   **Fix-task guide content (3):**
   - Contains `broken` severity level
   - Contains `feels-wrong` severity level
   - References T##-PLAN format (check for `T##-PLAN` or `task-plan` or `PLAN.md`)

   **SKILL.md updates (3):**
   - reference_index contains `fix-task-guide`
   - workflows_index contains `write-results`
   - routing mentions `write-results`

   **SKILL.md constraints (1):**
   - Line count < 500

   **Forbidden patterns (3):**
   - No `activeSlice` in template
   - No `activeSlice` in workflow
   - No `activeSlice` in fix-task guide

   **No markdown headings in workflow (1):**
   - awk check for `^#` lines in write-results.md outside code blocks (same pattern as S01's SKILL.md check)

   **S01 and S02 regression (2):**
   - `verify-s01.sh` passes
   - `verify-s02.sh` passes

   Must create the `scripts/` directory first: `mkdir -p .gsd/milestones/M001/slices/S03/scripts`

3. **Run the script** and fix any failures. All checks must pass. Report the final count.

## Must-Haves

- [ ] Script follows S01/S02 pattern: `set -euo pipefail`, helper functions, exit-on-first-failure
- [ ] All ~23 checks implemented and passing
- [ ] S01 and S02 regression checks included and passing
- [ ] Markdown heading check uses awk to exclude code blocks (not naive grep)

## Verification

- `bash .gsd/milestones/M001/slices/S03/scripts/verify-s03.sh` — all checks pass with zero failures

## Inputs

- `.gsd/milestones/M001/slices/S02/scripts/verify-s02.sh` — pattern to follow for script structure and helper functions
- `~/.gsd/agent/skills/gsd-verify-work/templates/uat-result.md` — file to validate (created in T01)
- `~/.gsd/agent/skills/gsd-verify-work/references/fix-task-guide.md` — file to validate (created in T01)
- `~/.gsd/agent/skills/gsd-verify-work/workflows/write-results.md` — file to validate (created in T02)
- `~/.gsd/agent/skills/gsd-verify-work/SKILL.md` — file to validate (updated in T02)

## Observability Impact

- **Signals changed:** The verification script itself is the primary observability surface — it outputs 26 PASS/FAIL lines and exits on first failure with a descriptive label.
- **Inspection:** `bash .gsd/milestones/M001/slices/S03/scripts/verify-s03.sh` reruns the full check suite. The script resolves sibling scripts via `SCRIPT_DIR`-relative paths, so it works from any cwd.
- **Failure state:** Any structural regression (missing file, wrong content, reintroduced `activeSlice`) causes the script to exit 1 with a specific FAIL label identifying the broken check.

## Expected Output

- `.gsd/milestones/M001/slices/S03/scripts/verify-s03.sh` — verification script with ~23 checks, all passing
