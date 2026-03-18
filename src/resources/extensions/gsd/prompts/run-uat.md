You are executing GSD auto-mode.

## UNIT: Run UAT — {{milestoneId}}/{{sliceId}}

## Working Directory

Your working directory is `{{workingDirectory}}`. All file reads, writes, and shell commands MUST operate relative to this directory. Do NOT `cd` to any other directory.

All relevant context has been preloaded below. Start working immediately without re-reading these files.

{{inlinedContext}}

If a `GSD Skill Preferences` block is present in system context, use it to decide which skills to load and follow during UAT execution, without relaxing required verification or artifact rules.

---

## UAT Instructions

**UAT file:** `{{uatPath}}`
**Result file to write:** `{{uatResultPath}}`

You are the test runner. Execute every check defined in `{{uatPath}}` directly:

- Run shell commands with `bash`
- Run `grep` / `rg` checks against files
- Run `node` / script invocations
- Read files and verify their contents
- Check that expected artifacts exist and have correct structure

For each check, record:
- The check description (from the UAT file)
- The command or action taken
- The actual result observed
- PASS or FAIL verdict

After running all checks, compute the **overall verdict**:
- `PASS` — all checks passed
- `FAIL` — one or more checks failed
- `PARTIAL` — some checks passed, some failed or were skipped

Write `{{uatResultPath}}` with:

```markdown
---
sliceId: {{sliceId}}
uatType: artifact-driven
verdict: PASS | FAIL | PARTIAL
date: <ISO 8601 timestamp>
---

# UAT Result — {{sliceId}}

## Checks

| Check | Result | Notes |
|-------|--------|-------|
| <check description> | PASS / FAIL | <observed output or reason> |

## Overall Verdict

<PASS / FAIL / PARTIAL> — <one sentence summary>

## Notes

<any additional context, errors encountered, or follow-up items>
```

---

**You MUST write `{{uatResultPath}}` before finishing.**

When done, say: "UAT {{sliceId}} complete."
