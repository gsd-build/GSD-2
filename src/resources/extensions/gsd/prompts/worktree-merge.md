You are merging GSD artifacts from worktree **{{worktreeName}}** (branch `{{worktreeBranch}}`) into target branch `{{mainBranch}}`.

## Context

The worktree was created as a parallel workspace. It may contain new milestones, updated roadmaps, new plans, research, decisions, or other GSD artifacts that need to be reconciled with the main branch.

### Commit History (worktree)

```
{{commitLog}}
```

### GSD Artifact Changes

**Added files:**
{{addedFiles}}

**Modified files:**
{{modifiedFiles}}

**Removed files:**
{{removedFiles}}

### Full Diff

```diff
{{fullDiff}}
```

## Your Task

Analyze the changes and guide the merge. Follow these steps exactly:

### Step 1: Categorize Changes

Classify each changed GSD artifact:
- **New milestones** — entirely new M###/ directories with roadmaps
- **New slices/tasks** — new planning artifacts within existing milestones
- **Updated roadmaps** — modifications to existing M###-ROADMAP.md files
- **Updated plans** — modifications to existing slice or task plans
- **Research/context** — new or updated RESEARCH.md, CONTEXT.md files
- **Decisions** — changes to DECISIONS.md
- **Requirements** — changes to REQUIREMENTS.md
- **Other** — anything else

### Step 2: Conflict Assessment

For each **modified** file, check whether the main branch version has also changed since the worktree branched off. Flag any files where both branches have diverged — these need manual reconciliation.

Read the current main-branch version of each modified file and compare it against both the worktree version and the common ancestor to identify:
- **Clean merges** — main hasn't changed, worktree changes can apply directly
- **Conflicts** — both branches changed the same file; needs reconciliation
- **Stale changes** — worktree modified a file that main has since replaced or removed

### Step 3: Merge Strategy

Present a merge plan to the user:

1. For **clean merges**: list files that will merge without conflict
2. For **conflicts**: show both versions side-by-side and propose a reconciled version
3. For **new artifacts**: confirm they should be added to the main branch
4. For **removed artifacts**: confirm the removals are intentional

Ask the user to confirm the merge plan before proceeding.

### Step 4: Execute Merge

Once confirmed:

1. If there are conflicts requiring manual reconciliation, apply the reconciled versions to the main branch working tree
2. Run `git merge --squash {{worktreeBranch}}` to bring in all changes
3. Review the staged changes — if any reconciled files need adjustment, apply them now
4. Commit with message: `merge(worktree/{{worktreeName}}): <summary of what was merged>`
5. Report what was merged

### Step 5: Cleanup Prompt

After a successful merge, ask the user whether to:
- **Remove the worktree** — delete `.gsd/worktrees/{{worktreeName}}/` and the `{{worktreeBranch}}` branch
- **Keep the worktree** — leave it for continued parallel work

If the user chooses to remove it, run `/worktree remove {{worktreeName}}`.

## Important

- Never silently discard changes from either branch
- When in doubt about a conflict, show both versions and ask the user
- Preserve all GSD artifact formatting conventions (frontmatter, section structure, checkbox states)
- If the worktree introduced new milestone IDs that conflict with main, flag this immediately
