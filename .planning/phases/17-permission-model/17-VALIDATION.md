---
phase: 17
slug: permission-model
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-15
---

# Phase 17 — Validation Strategy

> Per-phase validation contract. Reconstructed from PLAN and SUMMARY artifacts (State B — no prior VALIDATION.md existed).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test (bun:test) |
| **Config file** | `packages/mission-control/bunfig.toml` |
| **Quick run command** | `cd packages/mission-control && bun test tests/trust-api.test.ts tests/trust-dialog.test.tsx tests/boundary-enforcer.test.ts --timeout 10000` |
| **Full suite command** | `cd packages/mission-control && bun test --timeout 30000` |
| **Estimated runtime** | ~1 second (Phase 17 tests only); ~30 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/mission-control && bun test tests/trust-api.test.ts tests/trust-dialog.test.tsx tests/boundary-enforcer.test.ts --timeout 10000`
- **After every plan wave:** Run `cd packages/mission-control && bun test --timeout 30000`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~1 second (Phase 17 slice)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | PERM-01, PERM-02 | unit | `cd packages/mission-control && bun test tests/trust-api.test.ts --timeout 10000` | ✅ | ✅ green |
| 17-01-02 | 01 | 1 | PERM-04 | unit (source-text) | `cd packages/mission-control && bun test tests/trust-dialog.test.tsx --timeout 10000` | ✅ | ✅ green |
| 17-01-03 | 01 | 1 | PERM-01, PERM-04 | unit (source-text) | `cd packages/mission-control && bun test tests/trust-dialog.test.tsx --timeout 10000` | ✅ | ✅ green |
| 17-02-01 | 02 | 2 | PERM-03 | unit | `cd packages/mission-control && bun test tests/boundary-enforcer.test.ts --timeout 10000` | ✅ | ✅ green |
| 17-02-02 | 02 | 2 | PERM-03 | integration (build) | `cd packages/mission-control && bun build src/frontend.tsx --outdir /tmp/boundary-build-test --target browser 2>&1 \| grep -E "(error\|Error\|✓)"` | ✅ | ✅ green |
| 17-02-03 | 02 | 2 | PERM-02 | integration (build) | `cd packages/mission-control && bun build src/frontend.tsx --outdir /tmp/trust-app-build --target browser 2>&1 \| grep -E "(error\|Error\|✓)"` | ✅ | ✅ green |
| 17-03-01 | 03 | 3 | PERM-01 through PERM-04 | smoke (full suite) | `cd packages/mission-control && bun test --timeout 30000 2>&1 \| tail -5` | ✅ | ✅ green |
| 17-03-02 | 03 | 3 | PERM-02, PERM-03, PERM-04 | manual | Human verification SC-1 through SC-4 | N/A | ✅ green (human-approved 2026-03-14) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

- `packages/mission-control/tests/trust-api.test.ts` — 7 tests for PERM-01/PERM-02 (isTrusted, writeTrustFlag, registerTrustRoutes)
- `packages/mission-control/tests/trust-dialog.test.tsx` — 10 source-text assertion tests for PERM-01/PERM-04 (SettingsView, App.tsx, AdvancedPermissionsPanel)
- `packages/mission-control/tests/boundary-enforcer.test.ts` — 7 behavioral tests for PERM-03 (detectBoundaryViolation)

All 24 tests pass. No new Wave 0 installs required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Trust dialog appears on first project load and does not reappear after confirmation | PERM-02 | Runtime HTTP fetch sequencing and conditional React render logic cannot be verified from static source alone | Delete `.gsd/.mission-control-trust`, reload `http://localhost:4000`, confirm dialog appears, click "I understand, start building", confirm dialog disappears, reload page again, confirm dialog does NOT reappear |
| BOUNDARY_VIOLATION banner visible in running UI when violation event arrives over WebSocket | PERM-03 | WebSocket delivery and React state update require a live browser session; triggering a real out-of-project write in a test environment is impractical | Source verification: `grep -n "interrupt\|boundary_violation" packages/mission-control/src/server/pipeline.ts` — confirms `interrupt()` precedes `publishChat`. Visual banner confirmation requires live session. Human-approved SC-3 on 2026-03-14 |
| AdvancedPermissionsPanel toggle defaults are intentional | PERM-04 | ROADMAP SC-4 says "all off by default" but PLAN 17-01 specifies packageInstall/shellBuildCommands/gitCommits=true. Human resolution needed. | Open Settings → Build Permissions → Manage build permissions. Confirm with project owner whether current defaults (packageInstall/shellBuildCommands/gitCommits=ON, gitPush=OFF) are intentional |

---

## Requirements Coverage

| Requirement | Description | Test Files | Status |
|-------------|-------------|------------|--------|
| PERM-01 | Raw "Skip permissions" toggle removed from Settings; replaced with "Manage build permissions →" link | `trust-dialog.test.tsx` (SettingsView source checks) | ✅ COVERED |
| PERM-02 | Trust dialog shown once per new project; `.gsd/.mission-control-trust` written on confirm | `trust-api.test.ts` (isTrusted, writeTrustFlag, GET+POST /api/trust) + manual lifecycle verification | ✅ COVERED (automated + manual) |
| PERM-03 | Hard boundary enforcement — stdout intercepted; violations blocked and surfaced as BOUNDARY_VIOLATION UI event | `boundary-enforcer.test.ts` (detectBoundaryViolation behavioral tests) + manual banner verification | ✅ COVERED (automated + manual) |
| PERM-04 | Advanced permission settings — plain-language toggles with ask-before-each debug warning | `trust-dialog.test.tsx` (AdvancedPermissionsPanel source checks) | ✅ COVERED |

---

## Test Results (Verified 2026-03-15)

```
bun test tests/trust-api.test.ts tests/trust-dialog.test.tsx tests/boundary-enforcer.test.ts --timeout 10000
 24 pass
 0 fail
 33 expect() calls
Ran 24 tests across 3 files. [757.00ms]
```

Full suite baseline at phase close: 727 pass, 0 fail (730 total including 3 todo).

---

## Anti-Patterns Noted

| File | Issue | Severity | Resolution |
|------|-------|----------|------------|
| `pipeline.ts` line ~88 | Stale `// TODO (Phase 13): read skip_permissions from .gsd/preferences.md` — `skipPermissions` remains hardcoded `true` | INFO | Intentional: trust dialog and boundary enforcer are the Phase 17 replacement for the UI toggle. Stale comment is misleading but not a functional blocker |
| `AdvancedPermissionsPanel.tsx` lines 15-21 | `DEFAULT_PERMISSION_SETTINGS` has packageInstall/shellBuildCommands/gitCommits=true; ROADMAP SC-4 says "all off by default" | INFO | PLAN 17-01 explicitly overrides ROADMAP wording with sensible defaults. Human resolution recommended |
| `App.tsx` lines 65-68 | `onAdvanced` in TrustDialog advances to AppShell instead of directly opening AdvancedPermissionsPanel | INFO | UX deviation — user lands on AppShell then opens Settings for permissions. Not a functional blocker |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 1s (Phase 17 slice)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-15 (reconstructed from PLAN/SUMMARY artifacts; all 24 tests green; human verification SC-1 through SC-4 approved 2026-03-14)
