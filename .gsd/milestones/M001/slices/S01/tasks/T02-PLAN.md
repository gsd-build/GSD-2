---
estimated_steps: 3
estimated_files: 2
---

# T02: Write router-pattern SKILL.md with activation triggers and UAT philosophy

**Slice:** S01 — Skill scaffold and slice targeting
**Milestone:** M001

## Description

Write the main `SKILL.md` for the `gsd-verify-work` skill following the GSD v2 router-pattern skill conventions. This is the skill entry point that defines activation triggers (R006), sets the UAT philosophy, and routes to workflows that S02/S03 will create.

The SKILL.md must have valid YAML frontmatter with `name: gsd-verify-work` and a `description` field containing trigger phrases ("verify work", "test this slice", "run UAT"). The body must be pure XML — no markdown headings (`#`, `##`). It must stay under 500 lines total.

Also write a verification script that validates the entire S01 output structurally.

**Relevant skills to load:** `create-skill` (for YAML frontmatter requirements, pure XML body rules, router pattern structure)

## Steps

1. **Write `~/.gsd/agent/skills/gsd-verify-work/SKILL.md`** following the router-pattern template:

   **YAML frontmatter:**
   ```yaml
   ---
   name: gsd-verify-work
   description: Run human-driven UAT verification for completed GSD slices. Synthesizes UAT items into experience scenarios, guides interactive testing, captures findings with severity, and generates fix tasks. Use when asked to "verify work", "test this slice", "run UAT", or similar phrases about testing completed work.
   ---
   ```
   
   **XML body sections (in order):**
   - `<essential_principles>` — Why human UAT matters (not mechanical checklists), the severity model (broken / feels-wrong / change-request / observation with definitions), the targeting principle (always parse roadmap, never trust activeSlice — reference `references/slice-targeting.md`)
   - `<routing>` — Route to `workflows/run-uat.md` (S02 will create this). For now, note it's not yet available and the skill is partially implemented.
   - `<quick_reference>` — File path patterns (`{SID}-UAT.md`, `{SID}-UAT-RESULT.md`), severity level quick reference, directory layout
   - `<reference_index>` — Point to `references/slice-targeting.md` with description
   - `<workflows_index>` — List `workflows/run-uat.md` as "planned (S02)" 
   - `<success_criteria>` — What a well-executed UAT verification looks like

2. **Verify SKILL.md quality:**
   - Pure XML body — no `#` headings outside YAML frontmatter and code blocks
   - Under 500 lines
   - Description field is a single line with all trigger phrases
   - Essential principles set philosophy, not just mechanics

3. **Write verification script** at `.gsd/milestones/M001/slices/S01/scripts/verify-s01.sh`:
   - Check file existence: SKILL.md, references/slice-targeting.md
   - Check directory existence: workflows/, templates/, references/
   - Validate YAML frontmatter: `name: gsd-verify-work` present, `description` present
   - Check trigger phrases in description: "verify work", "test this slice", "run UAT"
   - Check no markdown headings in body (outside code blocks — grep for lines starting with `#` that aren't in fenced blocks or YAML frontmatter)
   - Check line count < 500
   - Check slice-targeting.md has key content (activeSlice warning, UAT-RESULT, roadmap)
   - Print PASS/FAIL for each check and exit with non-zero on any failure

## Must-Haves

- [ ] SKILL.md has valid YAML frontmatter with `name: gsd-verify-work` and `description` containing all three trigger phrases
- [ ] Body is pure XML — no markdown headings
- [ ] Under 500 lines total
- [ ] Essential principles cover: human judgment philosophy, severity model (4 levels with definitions), targeting principle (parse roadmap, not activeSlice)
- [ ] Routes to `workflows/run-uat.md` (even though it doesn't exist yet)
- [ ] Verification script passes all structural checks

## Verification

- `bash .gsd/milestones/M001/slices/S01/scripts/verify-s01.sh` — all checks pass
- `wc -l < ~/.gsd/agent/skills/gsd-verify-work/SKILL.md` — returns a number less than 500
- `head -3 ~/.gsd/agent/skills/gsd-verify-work/SKILL.md | grep -q "^---$"` — YAML frontmatter present

## Inputs

- `~/.gsd/agent/skills/gsd-verify-work/references/slice-targeting.md` — T01 output, referenced from SKILL.md
- `~/.gsd/agent/skills/create-skill/SKILL.md` — conventions for skill authoring (load the create-skill skill for guidance)

## Expected Output

- `~/.gsd/agent/skills/gsd-verify-work/SKILL.md` — complete router-pattern skill entry point
- `.gsd/milestones/M001/slices/S01/scripts/verify-s01.sh` — structural verification script

## Observability Impact

- **New diagnostic surface:** `verify-s01.sh` provides per-check PASS/FAIL output with descriptive labels. Any agent or CI can run `bash .gsd/milestones/M001/slices/S01/scripts/verify-s01.sh` and immediately see which structural aspects of the skill are correct or broken.
- **Failure visibility:** The script exits non-zero on the first failure and prints the specific check that failed (e.g., "FAIL: SKILL.md missing YAML frontmatter name field"), so root cause is immediately visible without further investigation.
- **SKILL.md inspectability:** The skill file is a static document with no secrets — safe to `cat`, `diff`, and inspect fully. Line count and frontmatter validity can be checked with `wc -l` and `head -3 | grep "^---$"`.
- **No runtime signals:** This task produces static files only. There are no logs, metrics, or runtime observability surfaces.
