# Queue

<!-- Append-only log of milestones queued via /gsd queue. -->

- 2026-03-14 — Queued `M002` — Model Registry Hardening and Real-Scenario Verification
  - Focus: code review, model-registry-path quality cleanup, realistic startup/runtime verification, registry-path build/test hardening, and live models.dev coverage in the main suite.
  - Depends on: M001 completing
- 2026-03-14 — Queued `M003` — Upstream Reconciliation and PR Preparation
  - Focus: merge current upstream `origin/main`, preserve M001 and completed M002 behavior, proactively align with upstream conventions where beneficial, and leave a verified PR-ready local branch.
  - Depends on: M002 completing
- 2026-03-14 — Queued `M004` — Post-M003 Upstream Drift Reconciliation and CI Restoration
  - Focus: absorb upstream commits landed after M003, fix current CI/CD failures (starting with the `@gsd/pi-agent-core` build error), re-verify workflow compliance locally, and leave local `main` ready for an explicit later update of `models.dev-registration-pr`.
  - Depends on: M003 completing
