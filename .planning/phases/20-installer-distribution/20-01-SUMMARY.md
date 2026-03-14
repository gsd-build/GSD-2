---
phase: 20-installer-distribution
plan: "01"
subsystem: infra
tags: [tauri, github-actions, ci-cd, signing, macos, windows, linux, installer, appimage, deb, msi]

# Dependency graph
requires:
  - phase: 15-tauri-shell
    provides: src-tauri/ scaffold, tauri.conf.json, Cargo.toml — signing config must extend this
provides:
  - GitHub Actions release pipeline (.github/workflows/release.yml) triggering on release/* with 3-platform matrix
  - macOS universal binary build with Apple Developer ID certificate import and notarization env vars
  - Windows build with self-signed fallback (certificateThumbprint null)
  - Linux AppImage/deb build with GPG signing step
  - Tauri bundle signing stubs in tauri.conf.json (macOS/Windows/Linux sections)
  - 9 structural verification tests for the release workflow
affects: [20-02-updater, 20-03-macos-notarization, 20-04-windows-signing]

# Tech tracking
tech-stack:
  added: [tauri-apps/tauri-action@v0, dtolnay/rust-toolchain, Swatinem/rust-cache@v2]
  patterns: [matrix-build-ci, draft-release-creation, platform-gated-steps]

key-files:
  created:
    - .github/workflows/release.yml
    - packages/mission-control/tests/release-workflow.test.ts
  modified:
    - src-tauri/tauri.conf.json

key-decisions:
  - "Linux system deps (libwebkit2gtk-4.1-dev etc.) installed in workflow step — not in Dockerfile — keeps CI portable"
  - "import.meta.dir used in release-workflow.test.ts for path resolution (Bun-compatible, replaces process.cwd()-relative path from plan spec)"
  - "GPG sign step uses find src-tauri/target -name *.AppImage to locate artifact (tauri-action outputs to target/release/bundle/appimage/)"
  - "Windows: no WINDOWS_CERTIFICATE setup per user decision — self-signed acceptable for v2.0 demo"
  - "TAURI_SIGNING_PRIVATE_KEY env present in all 3 matrix jobs (not gated) — required by updater from Plan 02"

patterns-established:
  - "Platform-gated steps: use if: matrix.platform == 'ubuntu-22.04' pattern for OS-specific CI logic"
  - "Bun install split: curl | bash for Linux/macOS, irm | iex (pwsh) for Windows — both required for cross-platform matrix"

requirements-completed: [DIST-01, DIST-02]

# Metrics
duration: 4min
completed: 2026-03-14
---

# Phase 20 Plan 01: Release Pipeline Summary

**GitHub Actions release pipeline with 3-platform matrix (macOS universal binary, Windows self-signed, Linux GPG-AppImage) using tauri-apps/tauri-action@v0 for draft release creation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-14T20:05:06Z
- **Completed:** 2026-03-14T20:08:45Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Created `.github/workflows/release.yml` — full matrix CI pipeline triggering on release/* push and workflow_dispatch, draft GitHub Release created automatically
- Extended `src-tauri/tauri.conf.json` bundle section with macOS/Windows/Linux signing stubs (signingIdentity/certificateThumbprint null = env-driven CI config)
- Added 9 structural tests in `release-workflow.test.ts` validating workflow YAML elements without requiring actual GitHub Actions execution

## Task Commits

Each task was committed atomically:

1. **Task 1: GitHub Actions release workflow** - `b0fabaf` (feat)
2. **Task 2: Configure Tauri bundle signing** - `0b8121a` (chore)
3. **Task 3: Workflow structure verification test** - `ec8d0e1` (test)

## Files Created/Modified

- `.github/workflows/release.yml` — Complete release CI with 3-platform matrix, Bun install steps, Apple cert import, tauri-action, GPG signing
- `src-tauri/tauri.conf.json` — Added bundle.macOS, bundle.windows, bundle.linux signing stub sections
- `packages/mission-control/tests/release-workflow.test.ts` — 9 structural assertions for workflow YAML

## Decisions Made

- Used `import.meta.dir` (not `process.cwd()`) in test file for Bun-compatible path resolution — plan specified `process.cwd()` but `import.meta.dir` is the correct Bun pattern for `__dirname`-equivalent
- Added Ubuntu system dependency installation step (`libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, etc.) — required for Tauri Linux builds but not explicitly in plan; rule 2 auto-add
- GPG sign step uses `find src-tauri/target -name "*.AppImage"` — tauri-action outputs to `target/release/bundle/appimage/`, not `dist/` as plan spec suggested

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added Ubuntu system dependency install step**
- **Found during:** Task 1 (GitHub Actions release workflow)
- **Issue:** Tauri requires `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf` on Ubuntu — without these, build will fail with linker/library errors
- **Fix:** Added `sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf` step gated on `ubuntu-22.04`
- **Files modified:** `.github/workflows/release.yml`
- **Verification:** Standard Tauri Linux CI requirement; confirmed in tauri-apps/tauri-action documentation
- **Committed in:** b0fabaf (Task 1 commit)

**2. [Rule 1 - Bug] Fixed AppImage GPG sign path**
- **Found during:** Task 1 (GitHub Actions release workflow)
- **Issue:** Plan spec said `dist/*.AppImage` but tauri-action@v0 outputs to `src-tauri/target/release/bundle/appimage/`
- **Fix:** Changed to `find src-tauri/target -name "*.AppImage"` to locate artifact regardless of exact subpath
- **Files modified:** `.github/workflows/release.yml`
- **Verification:** `find` pattern is path-independent, handles any tauri-action output layout
- **Committed in:** b0fabaf (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both auto-fixes essential for correct Linux CI behavior. No scope creep.

## Issues Encountered

None — all tasks completed successfully on first attempt. Pre-existing test failures (server startup timeout, worktree CRUD temp file lock) unaffected by this plan's changes.

## User Setup Required

**GitHub Actions secrets require manual configuration.** Add these secrets in repository Settings → Secrets and variables → Actions:

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE` | Base64-encoded Apple Developer ID .p12 certificate |
| `APPLE_CERTIFICATE_PASSWORD` | .p12 export password |
| `APPLE_SIGNING_IDENTITY` | e.g. "Developer ID Application: Your Name (TEAMID)" |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_PASSWORD` | App-specific password for notarization |
| `TAURI_SIGNING_PRIVATE_KEY` | ed25519 private key for Tauri updater |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Passphrase for the above |
| `GPG_PRIVATE_KEY` | GPG private key for Linux AppImage signing |

`GITHUB_TOKEN` is automatic — no setup required.

## Next Phase Readiness

- Release pipeline fully wired; trigger by pushing to a `release/*` branch
- Plan 20-02 (updater) can add tauri-plugin-updater and `updater` block to tauri.conf.json without conflicts
- Plans 20-03/20-04 (notarization, Windows code signing) extend this workflow with additional secrets/steps
- `TAURI_SIGNING_PRIVATE_KEY` is already wired in all matrix jobs, ready for Plan 02 updater integration

## Self-Check

Verified:
- `.github/workflows/release.yml` exists — FOUND
- `src-tauri/tauri.conf.json` has bundle.macOS/windows/linux — FOUND
- `packages/mission-control/tests/release-workflow.test.ts` exists — FOUND
- Task commits b0fabaf, 0b8121a, ec8d0e1 — FOUND

## Self-Check: PASSED

---
*Phase: 20-installer-distribution*
*Completed: 2026-03-14*
