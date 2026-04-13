# GSD + Codex PR Workflow

[中文版](./gsd-codex-pr-workflow.zh-CN.md)

This guide shows a practical way to combine GSD and Codex to produce a focused, reviewable pull request with real verification behind it.

## Why use both

Use the two tools for different jobs:

- **GSD** owns scope, state, verification, git workflow, and PR structure.
- **Codex** is the sidecar for deep implementation help, debugging, adversarial review, and PR writing.

The combination works well because GSD keeps the work bounded and durable in `.gsd/`, while Codex gives you a second, independent pass on design and correctness.

## The Core Rules

If you want this workflow to produce a good PR instead of a messy AI diff, keep these rules:

1. **One writer at a time.** Do not let GSD and Codex edit the same files simultaneously.
2. **Mechanical gates decide done.** `build`, `typecheck`, `lint`, and `test` matter more than model confidence.
3. **Keep the PR focused.** One concern per PR.
4. **Use Codex as a reviewer, not just a generator.**
5. **You must be able to explain the final diff yourself.**

## Two Ways To Combine Them

### Recommended: GSD Leads, Codex Reviews

Use this for most work.

- GSD plans the PR, tracks progress, runs verification, and manages the branch.
- Codex reviews the plan, helps with hard debugging, and performs a strict pre-PR review.

This keeps `.gsd/` state truthful and avoids the hardest coordination problems.

### Advanced: Codex Edits the Active GSD Branch

Use this only if you are comfortable coordinating two tools manually.

- Pause GSD before letting Codex edit.
- Prefer `git.isolation: branch` so both tools operate in the project root.
- If you use `git.isolation: worktree`, launch Codex inside the active `.gsd/worktrees/<MID>/` path, not the main repo root.

If you skip these precautions, GSD may be planning in one tree while Codex is editing another.

## Prerequisites

In the target repository:

```bash
npm install -g gsd-pi
gh auth login          # optional, but recommended if you open PRs with gh
```

Then start GSD:

```bash
gsd
```

Inside GSD:

```text
/login
/model
```

Notes:

- GSD can run on many providers. If you have a **Codex** subscription, GSD can also use it directly via OAuth.
- This guide assumes you are running **Codex as a separate tool** and using GSD as the workflow engine.

## Recommended Project Preferences

Create or update `.gsd/PREFERENCES.md` in the target repo:

```yaml
---
version: 1
mode: team
token_profile: quality

git:
  isolation: branch
  push_branches: true
  auto_push: false
  auto_pr: false
  pre_merge_check: true

verification_commands:
  - npm run build
  - npm run typecheck
  - npm run lint
  - npm run test
verification_auto_fix: true
verification_max_retries: 2

post_unit_hooks:
  - name: code-review
    after: [execute-task]
    prompt: "Review the latest task for correctness, regressions, missing tests, API breakage, and security issues. If blockers remain, write NEEDS-REWORK.md with exact fixes."
    retry_on: NEEDS-REWORK.md
---
```

Why this setup:

- `mode: team` gives you safer PR-oriented defaults.
- `git.isolation: branch` makes Codex coordination easier than `worktree`.
- `verification_commands` ensures the PR is judged by commands, not vibes.
- `post_unit_hooks` adds a review pass after execution.

If you are the only person using GSD in the repo and do not want to commit `.gsd/` artifacts, see [`working-in-teams.md`](./working-in-teams.md) and set `git.commit_docs: false`.

## Recommended Workflow

### 1. Define the PR before code exists

Start in the target repository:

```bash
gsd
```

Then use one of these entry points:

- Bug fix PR: `/gsd start bugfix`
- General feature/refactor PR: `/gsd discuss`

Give GSD a brief like this:

```text
We are preparing one focused PR.

Goal:
- <what should land in this PR>

Non-goals:
- <what must not be included>

Issue / context:
- <issue link, bug report, or motivation>

Acceptance:
- <observable outcomes>

Verification:
- npm run build
- npm run typecheck
- npm run lint
- npm run test

Risk boundaries:
- <APIs, migrations, behavior, or docs that need extra care>
```

What GSD should produce:

- `.gsd/PROJECT.md`
- `.gsd/REQUIREMENTS.md`
- milestone context and roadmap
- a small number of slices/tasks with explicit verification

### 2. Let GSD plan first, not free-run blindly

Before letting either tool implement, get a concrete plan:

```text
/gsd
```

or:

```text
/gsd next
```

Advance until you have a current task plan. Review:

- `.gsd/STATE.md`
- `.gsd/PROJECT.md`
- `.gsd/DECISIONS.md`
- current slice plan
- current task plan

At this point, ask Codex for a **read-only plan review**.

Prompt for Codex:

```text
Read the current GSD plan and review it before implementation.

Files to read:
- .gsd/STATE.md
- .gsd/PROJECT.md
- .gsd/DECISIONS.md
- the active slice plan
- the active task plan

Check for:
- scope creep
- hidden regressions
- missing tests
- API or migration risks
- simpler implementation paths

Do not edit yet. Return concrete findings only.
```

If Codex finds a plan flaw, fix the plan first with `/gsd discuss` or `/gsd steer`.

### 3. Let GSD execute, and use Codex as the sidecar

Now run:

```text
/gsd auto
```

or continue step-by-step with:

```text
/gsd
```

Recommended usage:

- Let GSD do the normal task execution.
- Use Codex when one of these happens:
  - the task is tricky and you want a second design opinion
  - GSD stalls or loops
  - verification fails in a non-obvious way
  - you want a strict review before moving on

When GSD is actively editing, Codex should stay read-only.

If you want Codex to patch code:

1. Pause GSD with `Escape` or `/gsd pause`
2. Let Codex edit
3. Return to GSD and resume with `/gsd auto`

This preserves a single active writer.

### 4. Use Codex for hard debugging

When GSD gets stuck on a bug or failing verification, pause it and hand the failure to Codex.

Prompt for Codex:

```text
Debug this failure without expanding scope.

Read:
- current GSD task plan
- failing command output
- changed files in this branch

Goal:
- find the root cause
- propose the smallest correct fix
- preserve the intended PR scope

Return:
- root cause
- fix plan
- tests or verification that prove the fix
```

Once you have a credible fix, either:

- steer GSD with `/gsd steer`, or
- let Codex patch while GSD is paused, then resume GSD

### 5. Run an adversarial pre-PR review in Codex

Before opening the PR, do not trust the authoring pass alone.

Ask Codex to review the branch like a strict reviewer:

```text
Review this branch as if you are blocking the PR unless it is clearly correct.

Check for:
- correctness bugs
- regressions
- missing regression tests
- public API / CLI / config breakage
- docs or migration gaps
- security issues

Read the full changed files, not just the diff.
Return findings ordered by severity with file references.
If there are no findings, say that explicitly and list residual risks.
```

Fix anything real before moving on.

### 6. Verify mechanically

Even if GSD already ran the checks, run the final gates you want reviewers to trust.

Typical Node/TS repo:

```bash
npm run build
npm run typecheck
npm run lint
npm run test
```

If the repo uses a different stack, swap in the real commands.

For bug fixes, ensure you have a regression test that would fail without the fix.

### 7. Draft the PR body with Codex or by hand

This repository's contribution guide expects a PR body with **TL;DR**, **What**, **Why**, and **How**. See [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

Use this template:

```md
## TL;DR

**What:** <one sentence describing the change>
**Why:** <one sentence describing the problem>
**How:** <one sentence describing the approach>

## What

<Describe the user-visible and code-level changes. Keep it focused on this PR.>

## Why

<Describe the problem, root cause, or motivation. Link the issue if one exists.>

## How

<Explain the implementation approach, important tradeoffs, and why this design was chosen.>

## Verification

- npm run build
- npm run typecheck
- npm run lint
- npm run test

## AI-assisted disclosure

This PR was prepared with AI assistance. I reviewed the final diff, ran verification locally, and can explain the changes and tradeoffs.
```

Prompt for Codex:

```text
Draft a PR body from this branch.

Inputs:
- issue or problem statement
- final diff
- verification commands and results

Format:
- TL;DR
- What
- Why
- How
- Verification
- AI-assisted disclosure

Do not invent checks or results that did not happen.
```

### 8. Open the PR

Manual path:

```bash
git push -u origin <branch>
gh pr create
```

Automated path:

```yaml
git:
  auto_push: true
  auto_pr: true
  pr_target_branch: main
```

Only turn on `auto_pr` once you trust your verification and review loop.

## A Safe Day-To-Day Pattern

If you want a simple rule set that works well:

1. Use GSD to define and plan the PR
2. Use GSD to execute normal tasks
3. Use Codex to review plans before coding
4. Pause GSD and use Codex only for hard patches or hard debugging
5. Use Codex again for strict pre-PR review
6. Run the final command checks
7. Open the PR with a body you can defend

## Anti-Patterns

Avoid these if you want clean PRs:

- Running GSD auto-mode while Codex is editing the same files
- Asking Codex to "fix everything in the repo"
- Opening a PR before `build`, `lint`, `typecheck`, and `test` pass
- Letting AI generate a PR description you cannot explain
- Bundling drive-by refactors into a bug-fix PR
- Using GSD worktree mode while Codex is still attached to the repo root

## Definition Of Done For An AI-Assisted PR

You are ready to open the PR when all of these are true:

- The diff is focused on one concern
- The final state matches the GSD plan
- Verification commands pass
- A regression test exists for every bug fix
- Codex has done a strict review pass
- The PR body explains **what**, **why**, and **how**
- You can answer reviewer questions without asking the model again
