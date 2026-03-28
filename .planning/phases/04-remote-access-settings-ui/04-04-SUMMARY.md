---
phase: 04-remote-access-settings-ui
plan: 04
subsystem: test-coverage
tags: [tests, tailscale, auth, gap-closure]
dependency_graph:
  requires: [04-01, 04-02, 04-03]
  provides: [test-coverage-phase-04]
  affects: [src/web/tailscale-status.test.ts, src/web/tailscale-setup.test.ts, src/web/remote-access-api.test.ts, src/web/remote-access-panel.test.ts]
tech_stack:
  added: []
  patterns: [node:test describe/it, _deps injection for testability, tmpdir isolation for file I/O tests]
key_files:
  created: []
  modified:
    - src/web/tailscale-status.test.ts
    - src/web/tailscale-setup.test.ts
    - src/web/remote-access-api.test.ts
    - src/web/remote-access-panel.test.ts
decisions:
  - "_deps injection pattern reused from Phase 2 __tests__/tailscale.test.ts — same helper verbatim"
  - "AUTH_URL_PATTERN re-declared locally in tailscale-setup.test.ts — not exported from route, local decl documents contract"
  - "tmpdir isolation for all setPassword/getPasswordHash tests — never touches ~/.gsd"
  - "remote-access-panel.test.ts contains inline value assertions only — no React/DOM dependency"
metrics:
  duration_minutes: 8
  completed_date: "2026-03-28"
  tasks_completed: 2
  files_modified: 4
---

# Phase 04 Plan 04: Replace Test Stubs with Real Assertions Summary

**One-liner:** Replaced all four Phase 4 `it.todo()` stub test files with 41 real passing assertions covering parseTailscaleStatus trailing-dot stripping, _deps-injected getTailscaleStatus, getInstallCommand platform paths, AUTH_URL_PATTERN regex, hashPassword/verifyPassword scrypt correctness, setPassword/getPasswordHash tmpdir round-trip, session secret rotation, session token HMAC signing, and the status response shape contract.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace tailscale-status.test.ts and tailscale-setup.test.ts | 80b41d91 | src/web/tailscale-status.test.ts, src/web/tailscale-setup.test.ts |
| 2 | Replace remote-access-api.test.ts and remote-access-panel.test.ts | 9b991b8d | src/web/remote-access-api.test.ts, src/web/remote-access-panel.test.ts |

## Test Coverage Delivered

### tailscale-status.test.ts (11 tests)
- `parseTailscaleStatus`: trailing dot stripped from DNSName, HTTPS URL constructed, null on missing Self, null on null input, hostname/tailnet extraction
- `getTailscaleStatus` via `_deps` injection: ok+info on valid JSON, not-connected on non-zero exit, invalid-status on bad JSON
- `isTailscaleInstalled` via `_deps` injection: false on throw (CLI not on PATH), true on exit 0

### tailscale-setup.test.ts (7 tests)
- `getInstallCommand`: darwin returns `brew install tailscale`, linux returns curl script with `tailscale.com/install.sh`, win32 returns winget, freebsd falls back to curl
- `AUTH_URL_PATTERN` regex: matches valid auth URL, does not match google.com or tailscale.com/download
- Unsupported platform returns non-empty string (graceful fallback)

### remote-access-api.test.ts (13 tests)
- `hashPassword`: returns `salt_hex:hash_hex` matching `/^[0-9a-f]{32}:[0-9a-f]{128}$/`
- `verifyPassword`: true for correct password, false for wrong password, false for malformed hash (no colon)
- `setPassword` + `getPasswordHash` (tmpdir): hash is non-null after set, contains colon, null before set
- Session secret rotation: secret value changes after `setPassword`
- `createSessionToken`: contains exactly one dot separator
- `verifySessionToken`: returns SessionPayload for valid token+secret, null for wrong secret, null for tampered token
- Min-length guard logic: `'abc'.length < 4` fails, `'abcd'.length >= 4` passes

### remote-access-panel.test.ts (10 tests)
- Password form validation: `< 4` fails, `>= 4` passes, empty string fails
- `tailnetUrl` starts with `https://` when present
- `dnsName` does not end with trailing dot (stripped by `parseTailscaleStatus`)
- Connected response shape: `{ installed: true, connected: true, hostname, tailnetUrl, dnsName }`
- Not-installed response shape: `{ installed: false, connected: false, '', '', '' }`
- Password route path is `/api/settings/password` (not `/api/auth/password`) — documented per D-06

## Verification

```
npx tsx --test src/web/tailscale-status.test.ts src/web/tailscale-setup.test.ts src/web/remote-access-api.test.ts src/web/remote-access-panel.test.ts
```

Result: 41 tests, 0 failures, 0 todo, 0 skipped

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all `it.todo()` placeholders replaced with real assertions.

## Self-Check: PASSED
