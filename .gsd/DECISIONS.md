# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| # | When | Scope | Decision | Choice | Rationale | Revisable? |
|---|------|-------|----------|--------|-----------|------------|
| D001 | M001 | arch | Skill format | GSD v2 pure XML skill with router pattern | Must integrate with gsd-pi skill discovery; create-skill meta-skill defines conventions | No |
| D002 | M001 | arch | Browser automation | Not included — human is tester | This skill fills the human judgment gap; automated checks handled by existing run-uat dispatch | No |
| D003 | M001 | pattern | Test synthesis approach | Prompt-driven in skill references, not code | GSD skills are prompt-driven; synthesis intelligence lives in examples and anti-patterns within reference files | Yes — if prompt quality insufficient |
| D004 | M001 | convention | Severity levels | broken, feels-wrong, change-request, observation | Four levels cover the spectrum from blockers to informational; matches how humans naturally classify issues | Yes |
| D005 | M001 | arch | Slice targeting | Parse roadmap for last completed slice, not activeSlice | Known bugs #1693/#1695 show activeSlice is unreliable for UAT targeting; roadmap parsing is the correct approach | No |
| D006 | M001 | pattern | Fix task placement | Append to current slice for small fixes, new fix slice for substantial rework | Keeps small fixes local; avoids polluting current slice with large rework items | Yes |
| D007 | M001 | arch | Skill installation location | User-scope global: ~/.gsd/agent/skills/gsd-verify-work/ | Should be available across all GSD projects, not project-specific | Yes — if project-local preferred |
