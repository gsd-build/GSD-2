# S01: Skill scaffold and slice targeting

**Goal:** The `gsd-verify-work` skill exists at `~/.gsd/agent/skills/gsd-verify-work/` with a valid router-pattern SKILL.md, a slice-targeting reference, and placeholder directories for S02/S03 deliverables.
**Demo:** Skill activates on "verify work" / "test this slice" / "run UAT", identifies the correct slice (last completed with UAT file, no UAT-RESULT), and reads UAT content. Verified by installing the skill and confirming structural correctness.

## Must-Haves

- `~/.gsd/agent/skills/gsd-verify-work/SKILL.md` exists with valid YAML frontmatter (`name: gsd-verify-work`, `description` containing trigger phrases), pure XML body, under 500 lines
- `~/.gsd/agent/skills/gsd-verify-work/references/slice-targeting.md` documents the targeting algorithm: parse roadmap → filter `[x]` completed slices → take last completed → verify UAT file exists → verify no UAT-RESULT exists → return slice ID
- Targeting guidance explicitly warns against using `state.activeSlice` (D005, bugs #1693/#1695)
- Description field contains all trigger phrases: "verify work", "test this slice", "run UAT" (R006)
- Directory structure includes `workflows/`, `templates/` placeholder dirs for S02/S03
- SKILL.md essential principles cover UAT philosophy (human judgment, not mechanical checklists) and the severity model (broken/feels-wrong/change-request/observation)

## Verification

- `bash .gsd/milestones/M001/slices/S01/scripts/verify-s01.sh` — structural validation script checking:
  - File existence (SKILL.md, references/slice-targeting.md)
  - YAML frontmatter has `name: gsd-verify-work` and `description` field
  - Description contains trigger phrases ("verify work", "test this slice", "run UAT")
  - SKILL.md body has no markdown headings (`^#` outside code blocks)
  - SKILL.md is under 500 lines
  - slice-targeting.md contains the key algorithm steps (roadmap, completed, UAT, activeSlice warning)
  - Directory structure (workflows/, templates/, references/)
  - Outputs per-check PASS/FAIL labels; exits non-zero on first failure with descriptive message (failure-path diagnostic)

## Tasks

- [x] **T01: Write slice-targeting reference with roadmap-based UAT targeting algorithm** `est:30m`
  - Why: Core R005 deliverable — translates `checkNeedsRunUat()` from TypeScript into prompt-friendly guidance that the skill agent follows to identify the correct UAT target slice
  - Files: `~/.gsd/agent/skills/gsd-verify-work/references/slice-targeting.md`
  - Do: Create the skill directory structure (`gsd-verify-work/`, `references/`, `workflows/`, `templates/`). Write `slice-targeting.md` documenting the full targeting algorithm: (1) find and read the roadmap file at `.gsd/milestones/{MID}/{MID}-ROADMAP.md`, (2) parse the `## Slices` section for checkbox items `- [x]` vs `- [ ]`, (3) filter to completed slices, (4) take the last completed slice, (5) check UAT file exists at `.gsd/milestones/{MID}/slices/{SID}/{SID}-UAT.md`, (6) check UAT-RESULT file does NOT exist, (7) return the slice ID. Include edge cases (no completed slices, all slices done, no UAT file). Explicitly warn against using `state.activeSlice`. Reference the regex pattern `^\s*-\s+\[([ xX])\]\s+\*\*([\w.]+):\s+(.+?)\*\*` for parsing.
  - Verify: `test -f ~/.gsd/agent/skills/gsd-verify-work/references/slice-targeting.md && grep -q "activeSlice" ~/.gsd/agent/skills/gsd-verify-work/references/slice-targeting.md && grep -q "UAT-RESULT" ~/.gsd/agent/skills/gsd-verify-work/references/slice-targeting.md`
  - Done when: slice-targeting.md exists, documents all 7 algorithm steps, warns against activeSlice, covers edge cases, and includes the path patterns and regex

- [x] **T02: Write router-pattern SKILL.md with activation triggers and UAT philosophy** `est:30m`
  - Why: Core R006 deliverable and skill entry point — defines the YAML frontmatter with trigger phrases, sets essential UAT principles, and routes to workflows that S02/S03 will create
  - Files: `~/.gsd/agent/skills/gsd-verify-work/SKILL.md`, `.gsd/milestones/M001/slices/S01/scripts/verify-s01.sh`
  - Do: Write SKILL.md following the router-pattern template exactly. YAML frontmatter: `name: gsd-verify-work`, `description` as a single line containing what the skill does AND trigger phrases ("verify work", "test this slice", "run UAT"). Body in pure XML: `<essential_principles>` (why human UAT matters, severity model: broken/feels-wrong/change-request/observation, targeting principle: always parse roadmap never trust activeSlice), `<routing>` (route to `workflows/run-uat.md` which S02 will create), `<quick_reference>` (file path patterns, severity levels), `<reference_index>` (pointing to `references/slice-targeting.md`), `<workflows_index>` (listing `workflows/run-uat.md` as planned), `<success_criteria>`. Keep under 500 lines. Also write the verification script at `.gsd/milestones/M001/slices/S01/scripts/verify-s01.sh`. Load the `create-skill` skill for conventions.
  - Verify: `bash .gsd/milestones/M001/slices/S01/scripts/verify-s01.sh`
  - Done when: SKILL.md has valid YAML with trigger phrases, pure XML body, under 500 lines, and the verification script passes all checks

## Observability / Diagnostics

- **Structural validation script** (`verify-s01.sh`): Runs all structural checks and outputs per-check pass/fail with descriptive labels — any agent or CI can run it and immediately see which aspects of the skill are correct or broken.
- **Failure visibility**: The verification script exits non-zero on any failure and prints the specific check that failed (e.g., "FAIL: SKILL.md missing YAML frontmatter name field"), so root cause is immediately visible without further investigation.
- **Diagnostic check**: `verify-s01.sh` includes a check for malformed YAML frontmatter (missing `---` delimiters or missing required fields) and reports which field is absent, enabling agents to fix the exact issue.
- **No redaction constraints**: This skill contains no secrets — all files are safe to log, diff, and inspect fully.

## Files Likely Touched

- `~/.gsd/agent/skills/gsd-verify-work/SKILL.md`
- `~/.gsd/agent/skills/gsd-verify-work/references/slice-targeting.md`
- `.gsd/milestones/M001/slices/S01/scripts/verify-s01.sh`
