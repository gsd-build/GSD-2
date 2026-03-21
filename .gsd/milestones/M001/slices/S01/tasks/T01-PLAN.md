---
estimated_steps: 4
estimated_files: 4
---

# T01: Write slice-targeting reference with roadmap-based UAT targeting algorithm

**Slice:** S01 — Skill scaffold and slice targeting
**Milestone:** M001

## Description

Create the `gsd-verify-work` skill directory structure at `~/.gsd/agent/skills/gsd-verify-work/` and write `references/slice-targeting.md` — the core reference that documents how to identify the correct UAT target slice. This translates the logic from `checkNeedsRunUat()` (in the GSD auto-prompts source) into prompt-friendly guidance that an LLM agent can follow step by step.

The targeting algorithm must NOT use `state.activeSlice` — that has already advanced to the next slice (known bugs #1693, #1695). Instead, it parses the roadmap's `## Slices` section to find `[x]` completed slices, takes the last one, and verifies a UAT file exists but no UAT-RESULT exists.

**Relevant skills to load:** `create-skill` (for directory structure conventions)

## Steps

1. **Create the directory structure** at `~/.gsd/agent/skills/gsd-verify-work/`:
   - `references/` — for slice-targeting.md (this task)
   - `workflows/` — empty placeholder for S02
   - `templates/` — empty placeholder for S03
   
2. **Write `references/slice-targeting.md`** with the complete targeting algorithm:
   - **Finding the roadmap:** Read `.gsd/milestones/{MID}/{MID}-ROADMAP.md` from the project's `.gsd/` directory. The active milestone ID comes from `.gsd/STATE.md`.
   - **Parsing the `## Slices` section:** Each slice is a checkbox item matching: `- [x] **S01: Title** \`risk:low\` \`depends:[]\``. The `[x]` marks completion, `[ ]` marks incomplete. Use regex: `^\s*-\s+\[([ xX])\]\s+\*\*([\w.]+):\s+(.+?)\*\*`
   - **Filtering completed slices:** Collect all slices where the checkbox is `[x]` or `[X]`
   - **Taking the last completed:** `completedSlices[completedSlices.length - 1]` — the most recently completed slice in document order
   - **Checking UAT file exists:** Look for `.gsd/milestones/{MID}/slices/{SID}/{SID}-UAT.md`
   - **Checking no UAT-RESULT:** Verify `.gsd/milestones/{MID}/slices/{SID}/{SID}-UAT-RESULT.md` does NOT exist (idempotency guard)
   - **Return the slice ID** if all conditions met; otherwise explain why no UAT target was found

3. **Document edge cases:**
   - No completed slices → no UAT target yet (still working on first slice)
   - All slices completed → milestone complete path, UAT not applicable
   - Last completed slice has no UAT file → cannot run UAT (may need to check earlier completed slices, or inform user)
   - UAT-RESULT already exists → UAT already completed, skip

4. **Add the activeSlice warning** — a prominent callout explaining why `state.activeSlice` must NEVER be used for UAT targeting: it points to the *next* slice being worked on, not the one that just completed. Reference bugs #1693 and #1695.

## Must-Haves

- [ ] Directory structure exists: `~/.gsd/agent/skills/gsd-verify-work/{references,workflows,templates}/`
- [ ] `references/slice-targeting.md` documents all 7 algorithm steps
- [ ] Regex pattern for parsing checkbox items is included
- [ ] Path patterns for UAT and UAT-RESULT files are documented
- [ ] Edge cases (no completed, all completed, no UAT file, result already exists) are covered
- [ ] Explicit warning against using `state.activeSlice` with rationale

## Verification

- `test -d ~/.gsd/agent/skills/gsd-verify-work/references` — references dir exists
- `test -d ~/.gsd/agent/skills/gsd-verify-work/workflows` — workflows dir exists
- `test -d ~/.gsd/agent/skills/gsd-verify-work/templates` — templates dir exists
- `test -f ~/.gsd/agent/skills/gsd-verify-work/references/slice-targeting.md` — file exists
- `grep -q "activeSlice" ~/.gsd/agent/skills/gsd-verify-work/references/slice-targeting.md` — activeSlice warning present
- `grep -q "UAT-RESULT" ~/.gsd/agent/skills/gsd-verify-work/references/slice-targeting.md` — UAT-RESULT check documented
- `grep -q '\[x\]' ~/.gsd/agent/skills/gsd-verify-work/references/slice-targeting.md` — checkbox parsing documented

## Inputs

- `src/resources/extensions/gsd/auto-prompts.ts` (lines 725-767) — canonical `checkNeedsRunUat()` logic to translate
- `src/resources/extensions/gsd/roadmap-slices.ts` (lines 53-100) — `parseRoadmapSlices()` regex and parsing logic
- `src/resources/extensions/gsd/paths.ts` (lines 413-422) — `resolveSliceFile()` path resolution pattern

## Expected Output

- `~/.gsd/agent/skills/gsd-verify-work/references/slice-targeting.md` — complete targeting algorithm reference
- `~/.gsd/agent/skills/gsd-verify-work/workflows/` — empty placeholder directory
- `~/.gsd/agent/skills/gsd-verify-work/templates/` — empty placeholder directory
