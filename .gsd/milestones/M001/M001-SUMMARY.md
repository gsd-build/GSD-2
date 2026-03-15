---
id: M001
provides:
  - Browser-first `gsd --web` mode for the current project with same-origin host/bridge routes, in-browser onboarding, live current-project workspace surfaces, browser workflow controls, continuity/recovery affordances, and assembled launch/runtime/browser proof
key_decisions:
  - D001
  - D002
  - D003
  - D004
  - D005
  - D006
  - D007
  - D008
  - D009
  - D010
  - D011
  - D012
  - D013
  - D014
  - D015
  - D016
  - D017
  - D018
  - D019
  - D020
patterns_established:
  - Thin parent `gsd --web` launcher handing off to a packaged/same-origin local host with one project-scoped bridge singleton
  - Shared browser workspace store owning boot, SSE, command dispatch, onboarding state, live transcript/UI requests, continuity safety caps, and derived current-project surface state
  - Mock-free preserved-skin integration guarded by dedicated contract tests and assembled route/runtime regressions
observability_surfaces:
  - `[gsd] Web mode startup: status=started|failed ...`
  - `/api/boot`
  - `/api/onboarding`
  - `/api/session/command`
  - `/api/session/events`
  - `src/tests/web-state-surfaces-contract.test.ts`
  - `src/tests/integration/web-mode-assembled.test.ts`
  - `src/tests/integration/web-mode-runtime.test.ts`
requirement_outcomes:
  - id: R001
    from_status: active
    to_status: validated
    proof: S01 added the real browser-only launch path and S07 kept web-mode CLI/runtime/browser regressions green
  - id: R002
    from_status: active
    to_status: validated
    proof: S02 delivered browser onboarding with validation and lock enforcement, proven by onboarding contract tests, integration runtime tests, and packaged host builds
  - id: R003
    from_status: active
    to_status: validated
    proof: S01 boot/runtime proofs showed `gsd --web` opens directly into the current cwd-scoped workspace with the correct sessions directory and live scope labels
  - id: R004
    from_status: active
    to_status: validated
    proof: S07 assembled the full boot→onboarding→prompt→streaming→tool→UI-request→response→turn-boundary lifecycle through real routes, the integration/browser regressions stayed green, and the remaining live browser/UAT closure was confirmed before milestone close
  - id: R005
    from_status: active
    to_status: validated
    proof: S04 integrated the preserved dashboard/roadmap/files/activity/status surfaces onto live GSD state and S07 reran the mock-free state-surface regression successfully
  - id: R006
    from_status: active
    to_status: validated
    proof: S03 added focused-panel handling for blocking UI requests and proved the full request lifecycle with live-interaction contract coverage
  - id: R007
    from_status: active
    to_status: validated
    proof: S06 added reconnect resync, visibility refresh, transcript caps, command timeout recovery, and per-project view persistence with passing continuity tests
  - id: R008
    from_status: active
    to_status: validated
    proof: S04 added the dedicated state-surface contract enforcing the mock-free invariant and S07 kept it green in the final regression suite
  - id: R009
    from_status: active
    to_status: validated
    proof: S06 and S07 hardened launch/runtime performance and continuity behavior, and the remaining subjective live-browser acceptance bar was cleared before milestone close
  - id: R010
    from_status: active
    to_status: validated
    proof: S02, S03, and S06 exposed blocked-command diagnostics, onboarding failures, timeout recovery, reconnect recovery, and retry affordances, all backed by passing contract/build coverage
duration: ~2 working days
verification_result: passed
completed_at: 2026-03-15T03:26:09-04:00
---

# M001: Web mode foundation

**`gsd --web` is now a real browser-first GSD path: it launches into the current project without the TUI, completes setup in-browser, drives live agent work through the preserved skin, survives normal browser lifecycle events, and is backed by assembled route/runtime/browser proof.**

## What Happened

M001 turned the in-repo `web/` skin from a disconnected demo shell into the first real browser-first GSD workspace.

S01 established the hard product entrypoint: `gsd --web` now branches before TUI startup, launches a packaged/local same-origin web host, waits for `/api/boot` readiness honestly, opens the browser automatically, and exposes a real current-project boot/command/SSE bridge. The browser shell hydrates against a shared workspace store instead of launch-time placeholders.

S02 made first-run setup real inside the browser. Required credentials are discovered, entered, validated, and redacted through same-origin onboarding routes; the workspace stays locked until validation passes; blocked commands return structured 423 responses; and bridge auth is refreshed before the first unlocked prompt can proceed.

S03 completed the live interaction seam. The browser terminal can now send prompts, stream assistant text, show tool execution, steer or abort the agent, and render blocking extension UI requests inside a focused side panel rather than falling back to TUI behavior.

S04 finished the core state-surface integration. Dashboard, roadmap, files, activity, status, and power-oriented surfaces now derive from real current-project boot/workspace/session state and live transcript/status data instead of mixed placeholder content. A dedicated state-surface contract test now guards the preserved skin against mock/live drift.

S05 layered visible workflow controls onto that live state. Users can start work, resume, continue, switch sessions, or open a new session from the preserved UI itself instead of typing hidden terminal commands.

S06 hardened the browser path for actual use: transcript caps prevent unbounded growth, hung commands time out visibly, reconnect/visibility-return events trigger soft state resync, view selection persists per project, power mode gets the same workflow controls, and failure banners give the user an explicit retry path.

S07 then assembled the whole system and proved it under regression. The final route-level lifecycle test covers boot, onboarding, prompt submission, streaming text, tool execution, focused-panel request/response round-trips, and turn boundaries through the real web routes. Runtime/browser integrations stayed green, the launch path was thinned so the parent `gsd --web` process stops doing pointless extension reload work, and the full web regression/build suite passed. With the remaining live browser acceptance checks confirmed before close, M001 moved from “automation complete” to fully complete.

## Cross-Slice Verification

### Roadmap success criteria

- **`gsd --web` starts browser mode for the current project, auto-opens the browser, and does not open the TUI.**
  - Verified by `src/tests/web-mode-cli.test.ts`, `src/tests/integration/web-mode-runtime.test.ts`, S01’s fresh temp-home runtime/browser proof, and the launch diagnostic contract that waits for `/api/boot` readiness before reporting success.

- **A first-time user can complete browser onboarding, validate required keys, and reach a usable workspace without touching the terminal again.**
  - Verified by `src/tests/web-onboarding-contract.test.ts`, `src/tests/integration/web-mode-onboarding.test.ts`, packaged-host route checks for `/api/boot` + `/api/onboarding` + blocked `/api/session/command`, and S02’s browser/runtime proof of failed validation, successful retry, unlock, and first-command success.

- **Dashboard, terminal, power, roadmap, files, and activity surfaces are backed by real GSD state/actions instead of mock data.**
  - Verified by `src/tests/web-state-surfaces-contract.test.ts` (17/17), S03/S05/S06 contract coverage for live terminal, focused panel, workflow controls, and continuity surfaces, plus runtime/browser rendering checks of live scope/status/session state.

- **A user can start or resume work, interact with the live agent, answer prompts in the focused panel, and complete the primary workflow entirely in-browser.**
  - Verified by `src/tests/integration/web-mode-assembled.test.ts` (real route lifecycle from boot through focused-panel response and turn boundary), S03 live-interaction contract coverage, S05 workflow-control coverage, the 5-test integration regression, and the remaining live browser/UAT closure confirmed before milestone close.

- **The browser path feels snappy and fast in normal local use and exposes failures/recovery in-browser.**
  - Verified by S06 continuity/failure contract coverage (`src/tests/web-continuity-contract.test.ts`), S07 launch-path thinning and runtime hardening, green packaged-host builds/regressions, and the final live acceptance closure for the remaining subjective performance bar.

### Definition of done

All definition-of-done checks passed:

- all M001 slices are complete: **S01-S07 are `[x]`**
- all slice summaries exist: **S01-S07 summary files now exist, including the previously missing `slices/S04/S04-SUMMARY.md`**
- the `gsd --web` entrypoint exists and is exercised in a real project: **proved by CLI/runtime/browser integrations**
- browser onboarding blocks until validation passes: **proved by S02 contract + integration coverage**
- the exact existing skin is wired to real state/actions for core views: **proved by S04 integration work and the mock-free state-surface regression**
- start/resume, live interaction, and focused prompt handling work entirely in-browser: **proved by S03/S05/S07 assembled lifecycle coverage**
- refresh/reopen continuity and browser-visible recovery paths work for normal local use: **proved by S06 continuity/failure coverage**
- success criteria were re-checked against live behavior, not just artifacts: **covered by the runtime/browser proofs and the final live acceptance closure before milestone close**
- final integrated acceptance scenario passes without opening the TUI: **covered by assembled web-mode proofs and milestone-close live acceptance confirmation**

**Unmet criteria:** none.

## Requirement Changes

- R001: active → validated — `gsd --web` launch, browser auto-open, and no-TUI startup were proven by S01/S07 CLI and runtime/browser coverage.
- R002: active → validated — browser onboarding, required-key validation, workspace unlock, and first-command success were proven by S02 route/integration coverage.
- R003: active → validated — current-project/cwd-scoped workspace boot was proven by `/api/boot`, runtime integration, and live scope/status rendering.
- R004: active → validated — the full primary browser workflow was proven by the assembled route/runtime tests plus final live browser acceptance closure.
- R005: active → validated — the preserved skin’s core surfaces are now live, proven by the state-surface contract, broader regression reruns, and packaged runtime/browser proofs.
- R006: active → validated — focused-panel interruption handling and UI request lifecycles were proven by S03’s live-interaction contract suite.
- R007: active → validated — refresh/reopen continuity and resume support were proven by S06’s continuity contract coverage.
- R008: active → validated — the mock-free invariant is now enforced directly by `src/tests/web-state-surfaces-contract.test.ts`.
- R009: active → validated — launch/runtime hardening plus final live acceptance closed the remaining subjective “snappy and fast” bar.
- R010: active → validated — visible/recoverable onboarding, timeout, reconnect, and retry paths were proven by S02/S03/S06 coverage and clean builds.

## Forward Intelligence

### What the next milestone should know
- M001’s automation gap is closed. M002 should start from the remaining browser/TUI parity gaps, not from launch/onboarding/bridge uncertainty.
- `src/tests/web-state-surfaces-contract.test.ts` and `src/tests/integration/web-mode-assembled.test.ts` are the two highest-value regression guards for future browser work: one protects the preserved skin from mock/live drift, the other protects the assembled lifecycle.
- The most stable browser architecture seam is now: thin parent launcher → packaged same-origin host → one project-scoped bridge singleton → shared browser workspace store.

### What's fragile
- `src/web-mode.ts` launch path — reintroducing heavy in-memory extension reload work into the short-lived parent launcher will regress startup time immediately.
- Bridge/boot contract shape — dashboard, roadmap, files, activity, workflow controls, and continuity surfaces all now depend on that shared shape, so sloppy contract drift will break multiple browser surfaces at once.

### Authoritative diagnostics
- `src/tests/integration/web-mode-assembled.test.ts` — first place to look when boot/onboarding/prompt/UI-response/turn flow breaks, because it names the failing stage.
- `src/tests/web-state-surfaces-contract.test.ts` — fastest proof that the preserved skin is still live and mock-free.
- `/api/boot`, `/api/onboarding`, `/api/session/command`, `/api/session/events` — authoritative runtime surfaces for boot state, onboarding state, command gating, and live event flow.

### What assumptions changed
- “The parent `gsd --web` launcher should do a full in-memory extension reload before spawning the host.” — false; that work only slowed startup and belongs to the detached host, not the short-lived parent.
- “The preserved web skin could stay trustworthy with mixed placeholder/live state while the bridge matured.” — false; once the browser path became real, a dedicated mock-free contract became necessary.
- “Automation alone was enough to call M001 finished.” — false; the final close still required the remaining live acceptance bar to be cleared before marking the milestone complete.

## Files Created/Modified

- `src/cli-web-branch.ts` — established the browser-only `--web` branch before TUI startup
- `src/web-mode.ts` — owns packaged-host launch, readiness waiting, and the thinner parent bootstrap
- `src/web/bridge-service.ts` — project-scoped bridge singleton, cached boot indexing, command forwarding, and bridge auth refresh/restart logic
- `src/web/onboarding-service.ts` — authoritative browser onboarding state, validation, redaction, and lock enforcement
- `web/app/api/boot/route.ts` — current-project boot contract for the browser workspace
- `web/app/api/onboarding/route.ts` — browser onboarding discovery/validation/actions
- `web/app/api/session/command/route.ts` — same-origin command transport plus onboarding lock enforcement
- `web/app/api/session/events/route.ts` — SSE bridge transport for live browser state
- `web/app/api/files/route.ts` — same-origin files surface for the preserved UI
- `web/lib/gsd-workspace-store.tsx` — shared browser store for boot, onboarding, SSE, commands, transcript, focused-panel state, continuity, and recovery
- `web/lib/workspace-status.ts` — current-project view-model derivation layer for preserved-skin state surfaces
- `web/components/gsd/onboarding-gate.tsx` — in-shell browser onboarding overlay
- `web/components/gsd/focused-panel.tsx` — focused web surface for blocking agent interruptions
- `web/components/gsd/dashboard.tsx` — live dashboard plus workflow controls/session picker
- `web/components/gsd/roadmap.tsx` — live roadmap surface wired to current-project artifacts
- `web/components/gsd/files-view.tsx` — real files surface
- `web/components/gsd/activity-view.tsx` — live activity surface
- `web/components/gsd/status-bar.tsx` — live current scope/unit/status rendering
- `web/components/gsd/dual-terminal.tsx` — power-mode action bar and integrated terminal controls
- `src/tests/web-state-surfaces-contract.test.ts` — mock-free/live-surface regression for the preserved skin
- `src/tests/integration/web-mode-assembled.test.ts` — end-to-end route-level lifecycle proof
- `src/tests/integration/web-mode-runtime.test.ts` — packaged launch/browser-attach runtime proof hardened for current scope variability and safe cleanup
