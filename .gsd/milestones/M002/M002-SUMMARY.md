---
id: M002
provides:
  - Safe browser-native handling for daily-use built-in slash commands so known built-ins never fall through to model prompt text in web mode
  - Current-project browser parity surfaces for session browsing, resume, fork, rename, settings, auth, Git, and remaining visible shell affordances
  - Targeted live freshness, browser recovery diagnostics, and packaged-host runtime proof for refresh, reopen, and interrupted-run recovery
key_decisions:
  - Treat `/api/boot` as a startup snapshot while authoritative browser freshness comes from typed live invalidation events plus narrow `/api/live-state` and `/api/recovery` routes.
  - Route browser built-ins through one authoritative dispatcher with `rpc`, `surface`, `local`, and `reject` outcomes so typed and clicked controls share one contract.
  - Close milestone risk with a shared packaged-host runtime harness and seeded recovery fixtures rather than route-only proof.
patterns_established:
  - Browser parity claims need named browser surfaces and shared store/RPC contracts, not transcript fallthrough or terminal-only escape hatches.
  - Current-project browser truth should stay on narrow on-demand routes and targeted invalidation refreshes instead of thickening `/api/boot`.
  - Final web hardening proof should run against the real standalone host and assert browser-visible routes, markers, and recovery behavior through refresh and reopen.
observability_surfaces:
  - `/api/session/command`, `/api/session/events`, `/api/session/browser`, `/api/live-state`, and `/api/recovery`
  - `lastSlashCommandOutcome`, `commandSurface.*`, and `useGSDWorkspaceState().live`
  - browser `data-testid` markers for command surfaces, live freshness, and recovery state plus the packaged-host runtime harness traffic assertions
requirement_outcomes:
  - id: R011
    from_status: active
    to_status: validated
    proof: verified by `src/tests/integration/web-mode-runtime.test.ts`, `src/tests/integration/web-mode-onboarding.test.ts`, `src/tests/integration/web-mode-assembled.test.ts`, `src/tests/web-command-parity-contract.test.ts`, `src/tests/web-session-parity-contract.test.ts`, `src/tests/web-live-state-contract.test.ts`, `src/tests/web-recovery-diagnostics-contract.test.ts`, `npm run build:web-host`, and the real packaged-host browser proof of refresh/reopen, daily-use controls, and seeded interrupted-run recovery
duration: 4 slices / multi-session
verification_result: passed
completed_at: 2026-03-15T18:10:00Z
---

# M002: Web parity and hardening

**Safe browser command dispatch, browser-native parity surfaces, targeted live freshness, and packaged-host recovery proof made `gsd --web` a first-class daily workspace.**

## What Happened

M002 finished the browser-first path that M001 made possible and closed the long-tail gaps that would otherwise keep `gsd --web` from being trustworthy for daily use.

S01 removed the highest-risk failure mode first: known built-in slash commands in web mode stopped falling through to the model as plain prompt text. The browser now resolves built-ins through one authoritative dispatcher with explicit `rpc`, `surface`, `local`, or `reject` outcomes, while preserving supported extension-command paths. That same slice introduced a shared browser command-surface/store contract so typed slash commands and clicked affordances use the same execution path for model selection, thinking level, auth entrypoints, resume, fork, session stats/export, and compaction.

S02 extended that shared surface into the remaining visible daily-use controls that were still thin or inert in the browser. Instead of thickening `/api/boot`, the web host gained dedicated current-project routes for session browsing and rename management plus a narrow Git summary route. The browser can now browse, search, resume, rename, and fork current-project sessions; manage queue, follow-up, compaction, and retry settings; manage auth from browser-native surfaces; and render title, widget, and editor-prefill shell signals as real user-facing browser state.

S03 then fixed the freshness and recovery truthfulness problems that remained after parity surfaces existed. `/api/boot` stayed a startup snapshot, while the bridge and store gained typed `live_state_invalidation` events and a narrow `/api/live-state` reload route for `auto`, `workspace`, and resumable-session freshness. The dashboard, sidebar, roadmap, and status bar now react to targeted live updates instead of aggressive boot polling. The slice also added `/api/recovery` plus a dedicated browser recovery surface backed by redacted doctor/forensics, validation, interrupted-run, and auth-refresh truth with actionable retry, resume, and refresh controls.

S04 closed the last runtime risk with real packaged-host proof instead of route-only confidence. A shared packaged-host browser harness and seeded runtime fixtures exercised refresh, reopen, daily-use control paths, and interrupted-run recovery against the real standalone host. That work exposed and fixed an important current-project truth bug in recovery diagnostics: when the bridge's live session was out of scope for the browser's current-project session set, recovery needed to prefer the best current-project resumable session rather than blindly following bridge state. With that corrected, the milestone moved R011 from active to validated and closed M002.

## Cross-Slice Verification

### Success criteria

- **Known built-in slash commands entered in web mode either execute, open a browser-native surface, or reject clearly without model fallthrough:** verified by `src/tests/web-command-parity-contract.test.ts`, `src/tests/integration/web-mode-assembled.test.ts`, and S01's live browser proof that `/session` opened the shared surface while `/share` produced an explicit browser-visible rejection instead of transcript fallthrough.
- **A current-project browser user can change model/thinking settings, browse and resume/fork current-project sessions, manage auth, and use the remaining visible shell affordances without terminal-only escape hatches:** verified by `src/tests/web-session-parity-contract.test.ts`, `src/tests/web-live-interaction-contract.test.ts`, `src/tests/integration/web-mode-assembled.test.ts`, `GET /api/session/browser`, `POST /api/session/manage`, `GET /api/git`, and S02's standalone-host smoke that opened the Git surface and exercised the shared session/settings/browser controls.
- **Dashboard, sidebar, roadmap, status, and recovery surfaces stay fresh during live work and after refresh/reconnect without aggressive `/api/boot` polling:** verified by `src/tests/web-live-state-contract.test.ts`, `src/tests/web-bridge-contract.test.ts`, `src/tests/web-state-surfaces-contract.test.ts`, `GET /api/live-state?domain=auto&domain=workspace`, and S03's confirmation that freshness now rides typed invalidation events plus targeted reloads with only one soft boot refresh on reconnect or visibility return.
- **Validation failures, interrupted runs, bridge/auth refresh problems, and resumable recovery paths are visible in-browser with actionable diagnostics and retry/resume controls:** verified by `src/tests/web-recovery-diagnostics-contract.test.ts`, `src/tests/integration/web-mode-runtime.test.ts`, `GET /api/recovery`, and the shared browser recovery surface markers and actions added in S03 and exercised again in S04.
- **A real `gsd --web` run survives refresh, reopen, and interrupted-run scenarios while remaining snappy under live activity:** verified by `src/tests/integration/web-mode-runtime.test.ts`, `src/tests/integration/web-mode-onboarding.test.ts`, `src/tests/integration/web-mode-assembled.test.ts`, `npm run build:web-host`, and the final packaged-host browser proof covering repo-root refresh/reopen continuity, daily-use controls, and seeded interrupted-run recovery.

All success criteria were met. None were left unmet.

### Definition of done

- **All M002 slices are complete:** confirmed by the roadmap state showing S01-S04 checked and by the presence of `S01-SUMMARY.md`, `S02-SUMMARY.md`, `S03-SUMMARY.md`, and `S04-SUMMARY.md` under `.gsd/milestones/M002/slices/`.
- **Each slice's demo outcome was re-verified:** confirmed by the slice verification results plus the final milestone reruns of the contract suite, integration/runtime suite, and `npm run build:web-host`.
- **Known daily-use built-ins no longer fall through from the browser terminal:** re-verified by the S01 command-parity contract and S04 assembled runtime/browser proof.
- **Current-project session/settings/auth/browser control surfaces are real, wired, and not inert:** re-verified by the S02 parity contracts and S04 packaged-host daily-use browser control proof.
- **Live workspace, auto, and recovery surfaces stay fresh without aggressive boot polling:** re-verified by S03's live-state and recovery contracts plus the live `/api/live-state` and `/api/recovery` checks.
- **Refresh, reopen, interrupted-run, and browser-recovery scenarios are exercised through the real `gsd --web` entrypoint:** re-verified by the final packaged-host runtime harness and seeded recovery fixtures in S04.
- **Success criteria were checked against live browser behavior, not only route-level tests:** confirmed by the standalone packaged-host browser proof used in S01-S04 closeout and the final S04 runtime verification.

## Requirement Changes

- R011: active → validated — verified by `src/tests/integration/web-mode-runtime.test.ts`, `src/tests/integration/web-mode-onboarding.test.ts`, `src/tests/integration/web-mode-assembled.test.ts`, `src/tests/web-command-parity-contract.test.ts`, `src/tests/web-session-parity-contract.test.ts`, `src/tests/web-live-state-contract.test.ts`, `src/tests/web-recovery-diagnostics-contract.test.ts`, `npm run build:web-host`, and the real packaged-host browser proof of refresh/reopen, daily-use controls, and seeded interrupted-run recovery.

## Forward Intelligence

### What the next milestone should know
- The authoritative closure bar for browser work is now the real packaged-host runtime proof, not route-only confidence; any follow-on browser scope should plan around browser-visible refresh/reopen/recovery verification from the start.
- Current-project scoping matters across every browser parity surface, especially recovery and resumable-session flows; when bridge state and browser-visible session scope diverge, the browser must stay truthful to the current project.
- Deferred scope still starts from `R020`, `R021`, `R022` or new user-requested work; M002 intentionally stopped at current-project daily-use parity rather than expanding into cross-project or analytics work.

### What's fragile
- `src/tests/integration/web-mode-runtime.test.ts` and the packaged-host harness are intentionally strict about real browser and network markers, so startup timing, session-dir handling, or recovery drift will surface there first.
- `src/web/recovery-diagnostics-service.ts` and the live invalidation logic in `web/lib/gsd-workspace-store.tsx` are easy places to silently regress back to stale or out-of-scope browser truth.

### Authoritative diagnostics
- `src/tests/integration/web-mode-runtime.test.ts` — best single signal for real standalone-host regressions across launch, refresh/reopen, daily-use browser controls, and interrupted-run recovery.
- `/api/session/events`, `/api/live-state`, and `/api/recovery` — these are the authoritative browser-facing freshness and recovery truths without transcript inference.
- `src/tests/web-command-parity-contract.test.ts`, `src/tests/web-session-parity-contract.test.ts`, `src/tests/web-live-state-contract.test.ts`, and `src/tests/web-recovery-diagnostics-contract.test.ts` — fastest contract-level alarms when browser parity drifts.

### What assumptions changed
- Node-side boot polling alone was not a durable runtime proof; the standalone host needed browser-context verification of `/api/boot`, SSE attachment, and recovery behavior.
- The bridge's live session was not always the right recovery session for the browser to inspect; current-project recovery truth needed explicit scoped session selection.

## Files Created/Modified

- `web/lib/browser-slash-command-dispatch.ts` — authoritative browser dispatcher for built-in slash-command execute, surface, local, and reject outcomes.
- `web/lib/command-surface-contract.ts` — shared inspectable state contract for model, thinking, auth, session, settings, Git, and recovery browser surfaces.
- `web/lib/gsd-workspace-store.tsx` — unified browser submit/action boundary plus live freshness, parity-surface, and recovery state management.
- `src/web/bridge-service.ts` — browser session helpers, rename behavior, typed live-state invalidation events, and selective live-state payload support.
- `web/app/api/session/browser/route.ts` — current-project session browser/search contract.
- `web/app/api/session/manage/route.ts` — current-project session rename/manage route with active vs inactive behavior.
- `web/app/api/git/route.ts` — on-demand current-project Git summary route for the sidebar/browser surface.
- `web/app/api/live-state/route.ts` — targeted `auto`, `workspace`, and resumable-session refresh route.
- `src/web/recovery-diagnostics-service.ts` — browser recovery diagnostics shaping plus current-project recovery-session selection fix.
- `web/app/api/recovery/route.ts` — on-demand browser recovery diagnostics route.
- `src/tests/integration/web-mode-runtime-fixtures.ts` — seeded packaged-host fixtures for current-project session and interrupted-run recovery proof.
- `src/tests/integration/web-mode-runtime.test.ts` — final packaged-host proof for launch, refresh/reopen, daily-use controls, and recovery continuity.
- `.gsd/REQUIREMENTS.md` — moved R011 from active to validated with milestone proof.
- `.gsd/milestones/M002/M002-ROADMAP.md` — recorded S04 completion and milestone closure status.
