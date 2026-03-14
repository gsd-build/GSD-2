# M004: Post-M003 Upstream Drift Reconciliation and CI Restoration — Context

**Gathered:** 2026-03-14
**Status:** Queued — pending auto-mode execution.

## Project Description

Reconcile the local post-M003 integration state with newer upstream `origin/main` changes that landed after M003 completed, fix the current CI/CD breakage exposed on the PR merge ref, and re-verify the branch so local `main` is the source of truth for an explicit later update of `models.dev-registration-pr`.

## Why This Milestone

M003 proved the branch against the upstream state that existed at the time, but upstream moved again and the current PR merge ref now fails CI during the `@gsd/pi-agent-core` build (`src/agent.ts` type error on the default model assignment). That means the earlier PR-ready proof is stale. This milestone restores trust by absorbing the newer upstream changes, fixing workflow-breaking regressions, and re-establishing verified push-readiness.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Run the current local verification flow against the newer upstream state and get green build/test/package-validation signal again.
- Update `models.dev-registration-pr` from verified local `main` with confidence that the current GitHub workflows should pass.

### Entry point / environment

- Entry point: local `main`, GitHub Actions workflows, and the later `models.dev-registration-pr` update path
- Environment: local dev, CI, and PR merge-ref compatibility
- Live dependencies involved: `origin/main` from `gsd-build/gsd-2`, local filesystem, TypeScript build/test toolchain, GitHub Actions workflow expectations

## Completion Class

- Contract complete means: the new upstream drift, failing CI/CD surface, and required verification scope are captured clearly enough to implement without ambiguity.
- Integration complete means: local `main` incorporates the newer upstream changes and preserves the models.dev milestone behavior while also fixing the new `pi-agent-core`/workflow regressions.
- Operational complete means: the relevant local verification commands pass against the reconciled codebase and the result is ready for an explicit later update/push of `models.dev-registration-pr`.

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- Reconciling the four upstream commits added after the M003 merge point does not regress M001/M002/M003 behavior or models.dev registry functionality.
- The current CI/CD failure surface is retired, including the `packages/pi-agent-core/src/agent.ts` TypeScript error and any additional workflow compliance issues uncovered by current verification.
- Local `main` finishes with green relevant verification and a clean branch state such that `models.dev-registration-pr` can be updated from it in a separate explicit outward-facing action.

## Risks and Unknowns

- **The visible CI failure may be only the first blocker** — Newer upstream workflow expectations may reveal additional failures after the current TypeScript error is fixed.
- **Upstream hook/auto-mode changes may interact with milestone code indirectly** — The failing file is in `pi-agent-core`, outside the original models.dev path, so regression analysis must stay broader than the registry package.
- **PR merge-ref behavior can differ from local branch verification** — The milestone needs verification that mirrors current workflow expectations closely enough to trust the later branch update.

## Existing Codebase / Prior Art

- `packages/pi-agent-core/src/agent.ts` — Current failing CI build surface; default model assignment now violates the newer type expectations.
- `.github/workflows/ci.yml` — Defines the current build, package-validation, and test workflow that the reconciled branch must satisfy.
- `.gsd/milestones/M003/` — Captures the prior upstream reconciliation baseline that this milestone extends rather than replaces.
- `origin/main` commits `efaa2326`, `56d03d37`, `dfb719ab`, `ac79547b` — New upstream changes landed after the M003 merge point and define the new reconciliation target.

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R013 — Reconcile newer upstream changes landed after M003 onto the local integration branch without regressing validated milestone behavior.
- R014 — Restore current GitHub CI/CD workflow compliance for the reconciled branch against the upstream workflow set now in force.
- R015 — Leave verified local `main` ready to update `models.dev-registration-pr` in a separate explicit push action.

## Scope

### In Scope

- Fetch and reconcile upstream changes that landed after the M003 merge point.
- Investigate and fix the current failing CI/CD surface, starting with the `@gsd/pi-agent-core` TypeScript build error.
- Run the relevant local workflow-equivalent verification commands (`build`, package validation, unit/integration tests, and any milestone-specific checks still required).
- Preserve the validated models.dev registry behavior and earlier milestone outcomes while absorbing newer upstream changes.
- Leave the repo in a clean, verified, push-ready state for a later explicit update of `models.dev-registration-pr`.

### Out of Scope / Non-Goals

- Performing the actual `git push` or any other outward-facing GitHub action as part of milestone auto-execution.
- Broad unrelated cleanup or refactors outside what is needed to reconcile newer upstream changes and restore workflow compliance.
- Rewriting M003 artifacts as if they were wrong; this milestone supersedes their operational freshness, not their historical record.

## Technical Constraints

- Use local `main` as the integration branch/source of truth during the reconciliation and repair work.
- Preserve the validated M001/M002/M003 outcomes unless a real defect is identified and intentionally changed.
- Verification must reflect the current GitHub workflow surface closely enough that later PR-branch update risk is materially reduced.
- No outward-facing GitHub action is permitted without later explicit user confirmation.

## Integration Points

- **`origin/main` / `gsd-build/gsd-2`** — Supplies the newer upstream commits that must be absorbed after M003.
- **`@gsd/pi-agent-core`** — Current failing build surface and likely first repair target.
- **GitHub Actions workflows** — Define the actual CI/CD compliance target (`build`, `validate-pack`, `test:unit`, `test:integration`).
- **`models.dev-registration-pr`** — Delivery branch to be updated later from the verified local integration state.

## Open Questions

- Are there additional workflow failures beyond the visible `agent.ts` type error once the first blocker is fixed? — Current expectation: likely yes or possible, so the milestone should treat the provided log as the first observed failure, not the whole failure set.
- Will the reconciled result require workflow-file changes, code changes, or both? — Current thinking: unknown until local workflow-equivalent verification is rerun against the newer upstream state.
