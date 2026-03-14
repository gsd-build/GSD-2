---
phase: 20-installer-distribution
plan: "02"
subsystem: auto-updater
tags: [tauri, updater, rust, react, sidebar]
dependency_graph:
  requires: [20-01]
  provides: [DIST-03]
  affects: [src-tauri/src/lib.rs, packages/mission-control/src/hooks/useAppUpdater.ts, packages/mission-control/src/components/layout/Sidebar.tsx]
tech_stack:
  added: [tauri-plugin-updater@2, tokio@1 (rt feature)]
  patterns: [dynamic-import-tauri, useEffect-on-mount-check, conditional-sidebar-banner]
key_files:
  created:
    - packages/mission-control/src/hooks/useAppUpdater.ts
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/tauri.conf.json
    - src-tauri/src/lib.rs
    - packages/mission-control/src/components/layout/Sidebar.tsx
decisions:
  - pubkey left as empty string — CI injects TAURI_SIGNING_PRIVATE_KEY during tauri build --ci
  - dynamic import of @tauri-apps/api/core in invokeIfTauri — hook silently no-ops outside Tauri webview
  - UpdateBanner placed between Settings gear and ConnectionStatus in Sidebar footer stack
  - GSD cyan #5BC8F0 for UpdateBanner CTA — matches accent-only design rule
requirements: [DIST-03]
metrics:
  duration: "8m 11s"
  completed: "2026-03-14"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 4
---

# Phase 20 Plan 02: Auto-Updater (tauri-plugin-updater) Summary

Wired tauri-plugin-updater with GitHub Releases JSON endpoint, useAppUpdater React hook, and UpdateBanner in Sidebar footer — seamless zero-infrastructure auto-update for DIST-03.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add tauri-plugin-updater to Rust and configure update endpoint | bd88527 | Cargo.toml, tauri.conf.json, lib.rs |
| 2 | useAppUpdater hook + UpdateBanner in Sidebar | 54ac093 | useAppUpdater.ts (new), Sidebar.tsx |

## What Was Built

### Task 1 — Rust updater plugin

- `tauri-plugin-updater = "2"` and `tokio = { version = "1", features = ["rt"] }` added to `Cargo.toml`
- `plugins.updater.endpoints` in `tauri.conf.json` points to `https://github.com/gsd-build/gsd-2/releases/latest/download/latest.json`
- `pubkey` left as `""` — CI populates via `TAURI_SIGNING_PRIVATE_KEY` secret
- `tauri_plugin_updater::UpdaterExt` imported in `lib.rs`
- Plugin registered: `.plugin(tauri_plugin_updater::Builder::new().build())`
- `check_for_updates` IPC command: calls `app.updater()?.check().await`, returns `bool`
- `install_update` IPC command: calls `updater.check()` then `update.download_and_install()`
- Both commands added to `tauri::generate_handler![]`

### Task 2 — React hook + Sidebar UpdateBanner

- `useAppUpdater.ts` hook: checks on mount via `invokeIfTauri('check_for_updates')`, exposes `updateReady`, `installing`, `installUpdate()`
- `invokeIfTauri` uses dynamic import with catch — silently returns `null` in browser dev mode
- `Sidebar.tsx`: imports `useAppUpdater`, calls hook in function body
- `UpdateBanner` renders between Settings gear and ConnectionStatus when `updateReady === true`
- Design: `#5BC8F0` (GSD cyan) text, `#131C2B` (surface) background, `#1E2D3D` border
- Collapsed state: shows `↑` arrow only; expanded: full "Update ready — restart to apply" text
- `installing` state: button shows "Installing…" and is disabled during download

## Verification

- `cargo check` in `src-tauri`: 0 errors (5m 40s compile, Finished dev profile)
- `bun run build` in `packages/mission-control`: 254 modules bundled, 0 TypeScript errors
- All success criteria met:
  1. `tauri-plugin-updater = "2"` in Cargo.toml
  2. `plugins.updater.endpoints` pointing to GitHub Releases in tauri.conf.json
  3. `check_for_updates` and `install_update` IPC commands registered in lib.rs
  4. `useAppUpdater` hook checks on mount, exposes `updateReady` + `installUpdate`
  5. Sidebar shows UpdateBanner above ConnectionStatus when `updateReady=true`
  6. Full TypeScript build passes, cargo check passes

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: packages/mission-control/src/hooks/useAppUpdater.ts
- FOUND: src-tauri/Cargo.toml
- FOUND: src-tauri/tauri.conf.json
- FOUND: src-tauri/src/lib.rs
- FOUND: packages/mission-control/src/components/layout/Sidebar.tsx
- FOUND: commit bd88527 (Task 1 — Rust updater plugin)
- FOUND: commit 54ac093 (Task 2 — React hook + Sidebar)
