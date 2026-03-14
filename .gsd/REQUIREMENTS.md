# Requirements

This file is the explicit capability and coverage contract for the project.

## Active

- R013 — Reconcile newer upstream changes landed after M003 onto local `main` without regressing validated milestone behavior
- R014 — Restore current GitHub CI/CD workflow compliance for the reconciled branch
- R015 — Leave verified local `main` ready to update `models.dev-registration-pr` via a later explicit push

## Validated

- R001 — Fetch model registry from models.dev (S01: contract-level unit tests)
- R002 — 12-hour cache with fallback (S01: contract-level unit tests)
- R003 — Version-triggered cache refresh (S01: contract-level unit tests)
- R004 — Bundled snapshot for offline-first cold start (S03: snapshot file + generation script + fallback verified)
- R005 — Preserve local models.json override capability (S02: implementation + code review)
- R006 — Remove models.generated.ts and generation script (S03: file deleted, no source references)
- R007 — Registry path build/test workflow must be trustworthy (M002/S01: npm run build && npm test succeed)
- R008 — Registry behavior proven through production-like scenarios (M002/S02: 9 scenario tests with tmpdir isolation)
- R009 — Live models.dev verification in main suite (M002/S03: live test with Zod validation and env var gate)
- R010 — Model registry path quality hardening (M002: import fixes, testability injection, observable diagnostics)
- R011 — Reconcile milestone work with current upstream mainline (M003/S01: clean merge, 41 tests pass)
- R012 — Leave reconciled work in verified PR-ready state (M003/S01: build + tests + clean git status)

## Deferred

(none)

## Out of Scope

(none)

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | core-capability | validated | M001/S01 | M001/S02 | S01 unit tests |
| R002 | quality-attribute | validated | M001/S01 | none | S01 unit tests |
| R003 | core-capability | validated | M001/S01 | none | S01 unit tests |
| R004 | quality-attribute | validated | M001/S03 | none | S03 snapshot + generation script |
| R005 | core-capability | validated | M001/S02 | none | S02 implementation + code review |
| R006 | operability | validated | M001/S03 | none | S03 file deletion + grep verification |
| R007 | operability | validated | M002/S01 | none | S01 build + test workflow |
| R008 | quality-attribute | validated | M002/S02 | none | S02 9 scenario tests |
| R009 | quality-attribute | validated | M002/S03 | none | S03 live test with Zod validation |
| R010 | operability | validated | M002 | none | Import fixes, testability injection, diagnostics |
| R011 | operability | validated | M003 | none | M003/S01 clean merge + 41 tests |
| R012 | operability | validated | M003 | none | M003/S01 build + tests + clean git |
| R013 | operability | active | M004 | none | Pending M004 execution |
| R014 | operability | active | M004 | none | Pending M004 execution |
| R015 | operability | active | M004 | none | Pending M004 execution |

## Coverage Summary

- Active requirements: 3
- Mapped to slices: 15
- Validated: 12
- Unmapped active requirements: 0
