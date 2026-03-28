---
phase: 03-sse-cursor-based-event-replay
plan: 03
subsystem: ui
tags: [sse, replay, cursor, localStorage, catching-up, banner, react, typescript]

# Dependency graph
requires:
  - phase: 03-sse-cursor-based-event-replay
    plan: 02
    provides: Named SSE event types (replay/live/snapshot), stream_live sentinel, cursor_expired handling
provides:
  - Project-scoped cursor tracking in localStorage (gsd-last-seq:<projectCwd>)
  - EventSource URL with ?since= query parameter on reconnect
  - Named SSE event listeners (replay, live, snapshot) with replay-safe event filtering
  - Monotonic dedupe via lastAppliedSeq (per-tab, in-memory)
  - isCatchingUp state driving CatchingUpBanner visibility
  - CatchingUpBanner component (thin top banner, non-intrusive, accessible)
  - Stale cursor handling: close stream, clear seq, refreshBoot, reopen stream
  - Auto-scroll during replay via existing handleEvent() path (D-02)
affects:
  - 04 (future phases using SSE replay infrastructure)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Project-scoped localStorage cursor key (gsd-last-seq:<projectCwd>) for multi-project isolation
    - Named SSE event listener pattern alongside backward-compat onmessage fallback
    - Monotonic dedupe (lastAppliedSeq in-memory per tab) prevents duplicate event application across tabs
    - isCatchingUp set before EventSource creation — banner appears immediately on reconnect before any data arrives
    - Replay-safe event filter skips live_state_invalidation and extension_ui_request during replay
    - onerror closes+recreates EventSource with latest cursor to fix Pitfall 5

key-files:
  created:
    - web/lib/components/catching-up-banner.tsx
  modified:
    - web/lib/gsd-workspace-store.tsx
    - web/components/gsd/app-shell.tsx

key-decisions:
  - "Project-scoped localStorage key (gsd-last-seq:<projectCwd>) prevents cursor bleed across projects"
  - "lastAppliedSeq kept in-memory per tab — localStorage only written on events, never read mid-session — prevents multi-tab cursor interference"
  - "REPLAY_UNSAFE_EVENT_TYPES includes live_state_invalidation and extension_ui_request — skipping control events prevents side effects (state reloads, blocking prompts) during replay"
  - "isCatchingUp set to true before EventSource creation so banner appears immediately (D-01 timing)"
  - "onerror handler closes+recreates EventSource to use latest stored cursor, not original URL (Pitfall 5 fix)"
  - "Snapshot handler flow: close stream, clear seq, refreshBoot(), then ensureEventStream() with no cursor"

patterns-established:
  - "SSE cursor pattern: getStoredSeq() on every ensureEventStream() call ensures latest cursor used"
  - "Replay filter pattern: REPLAY_UNSAFE_EVENT_TYPES set for O(1) lookup of control event types"

requirements-completed: [SESS-04, SESS-05, SESS-06, SESS-09]

# Metrics
duration: 15min
completed: 2026-03-28
---

# Phase 03 Plan 03: Client-Side Cursor Tracking and Catching-Up Banner Summary

**Project-scoped localStorage cursor tracking with named SSE event listeners, replay-safe event filtering, monotonic dedupe, and a non-intrusive CatchingUpBanner that appears immediately on reconnect**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-28T20:10:00Z
- **Completed:** 2026-03-28T20:25:00Z
- **Tasks:** 2 (Task 3 is human-verify checkpoint, auto-approved in auto_advance mode)
- **Files modified:** 3

## Accomplishments

- Extended `web/lib/gsd-workspace-store.tsx` with project-scoped localStorage cursor tracking (`gsd-last-seq:<projectCwd>`), `?since=N` on EventSource URL, named SSE event listeners for `replay`/`live`/`snapshot`, replay-safe event filtering, monotonic dedupe via `lastAppliedSeq`, stale cursor snapshot handling (close/clear/refreshBoot/reopen), and `isCatchingUp` state set immediately before EventSource creation
- Created `web/lib/components/catching-up-banner.tsx` — thin fixed top banner with spinning indicator, accessible (`role="status"`, `aria-live="polite"`), non-intrusive, disappears when live streaming resumes
- Mounted `CatchingUpBanner` in `WorkspaceChrome` layout (`app-shell.tsx`) driven by `workspace.isCatchingUp` state

## Task Commits

1. **Task 1: Add project-scoped cursor tracking, replay-safe event handling, monotonic dedupe, and named SSE listeners** - `82a640ce` (feat)
2. **Task 2: Create catching-up banner component and mount in WorkspaceChrome layout** - `6491a7b8` (feat)
3. **Task 3: Human-verify checkpoint** - auto-approved (auto_advance mode)

## Files Created/Modified

- `web/lib/gsd-workspace-store.tsx` - Added isCatchingUp state, localStorage helpers (seqStorageKey/getStoredSeq/storeSeq/clearStoredSeq), REPLAY_UNSAFE_EVENT_TYPES set, isReplayableEvent() filter, lastAppliedSeq field, modified ensureEventStream() with cursor tracking and named listeners, closeEventStream() resets isCatchingUp
- `web/lib/components/catching-up-banner.tsx` - New thin top banner component (fixed positioning, blue bg, animate-spin, role=status)
- `web/components/gsd/app-shell.tsx` - Imported CatchingUpBanner, rendered as first child in WorkspaceChrome return JSX

## Decisions Made

- Project-scoped localStorage key prevents cursor bleed across projects when using multi-project support
- Per-tab in-memory `lastAppliedSeq` prevents multi-tab duplicate event application without requiring locking
- `REPLAY_UNSAFE_EVENT_TYPES` filter skips `live_state_invalidation` (would trigger stale reloadLiveState calls) and `extension_ui_request` (would queue blocking prompts from old sessions)
- `isCatchingUp` set to true before `new EventSource(...)` call — banner appears immediately on reconnect, not after first data arrives (D-01 requirement)
- `onerror` closes+recreates EventSource with latest cursor via `ensureEventStream()` — fixes Pitfall 5 (browser auto-reconnect would reuse stale original ?since= value)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compiled clean (only pre-existing unrelated errors in packages/pi-coding-agent and packages/pi-ai).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Full SSE cursor-based event replay system is now complete end-to-end:
  - EventLog persists all bridge events with monotonic seq numbers (Plan 01)
  - SSE endpoint replays missed events with ceiling protocol and live buffering (Plan 02)
  - Client tracks project-scoped cursors, sends ?since=, handles replay/live/snapshot events, shows banner (Plan 03)
- System is ready for Phase 04

---
*Phase: 03-sse-cursor-based-event-replay*
*Completed: 2026-03-28*
