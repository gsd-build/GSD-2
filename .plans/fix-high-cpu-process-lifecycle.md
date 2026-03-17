# Fix: High CPU Usage on Long Auto-Mode Sessions

## Problem Statement

Long-running `/gsd auto` sessions exhibit high CPU usage due to multiple compounding issues:
process leaks, unguarded async intervals, synchronous git process spawning on hot paths,
and unbounded file I/O. These issues compound over time, making multi-hour sessions
progressively slower.

## Root Cause Analysis

Five parallel investigations identified 8 distinct issues across 3 categories:

### Category A: Process Lifecycle Leaks
- **A1**: Native git module never loads — `execFileSync("git", ...)` spawns a new process every 15s
- **A2**: Subagent isolation cleanup has no timeout — can hang indefinitely
- **A3**: Dead bg-shell processes retained in memory for 10-60 minutes during auto-mode

### Category B: Timer/Interval Leaks
- **B1**: Idle watchdog `setInterval` async callback has no error handling — unhandled rejections leave interval running forever
- **B2**: Recovery paths call `dispatchNextUnit()` without clearing old timers first — timer stacking
- **B3**: Progress widget polls every 5s with synchronous file reads

### Category C: I/O Accumulation
- **C1**: STATE.md rebuilt after every single unit completion (100-400ms per rebuild)
- **C2**: Dead process memory not pruned during auto-mode sessions

## Implementation Plan

### Fix 1: Wrap idle watchdog in try-catch (B1)
**File**: `src/resources/extensions/gsd/auto.ts`
**Change**: Wrap the entire `setInterval(async () => { ... }, 15000)` callback body in try-catch. On error, log warning and continue (don't let unhandled rejection orphan the interval). Add explicit `clearInterval` on caught errors that indicate unrecoverable state.

### Fix 2: Cache `nativeHasChanges` with TTL (A1)
**File**: `src/resources/extensions/gsd/native-git-bridge.ts`
**Change**: Add a simple timestamp+result cache to `nativeHasChanges()`. Return cached result if called within 10 seconds of last check. This eliminates the synchronous `git status --short` process spawn on every 15-second watchdog tick — at most 1 spawn per 10 seconds instead of potentially multiple per tick.

### Fix 3: Clear timers before recovery dispatch (B2)
**File**: `src/resources/extensions/gsd/auto.ts`
**Change**: In `recoverTimedOutUnit()`, call `clearUnitTimeout()` before each `dispatchNextUnit()` call. This prevents the old idle watchdog interval from running alongside new timers set by the recovery dispatch.

### Fix 4: Add timeout to subagent isolation cleanup (A2)
**File**: `src/resources/extensions/subagent/isolation.ts`
**Change**: Wrap the `git worktree remove --force` call in a `Promise.race` with a 10-second timeout. If timeout fires, fall through to `fs.rmSync` fallback (which already exists in the catch block).

### Fix 5: Prune dead bg-shell processes from auto-mode (A3/C2)
**File**: `src/resources/extensions/gsd/auto.ts`
**Change**: After each unit completion in `handleAgentEnd`, call the bg-shell `pruneDeadProcesses()` function (import it). This prevents dead process objects (each holding ~500KB-1MB of output buffers) from accumulating during long sessions.

### Fix 6: Throttle STATE.md rebuilds (C1)
**File**: `src/resources/extensions/gsd/auto.ts`
**Change**: Add a minimum interval (30 seconds) between STATE.md rebuilds. Track `lastStateRebuildAt` timestamp; if a rebuild was done within 30s, skip it. Always rebuild on stop/pause for consistency. This reduces the 100-400ms per-unit I/O spike.

### Fix 7: Increase progress widget update interval (B3)
**File**: `src/resources/extensions/gsd/auto-dashboard.ts`
**Change**: Increase the progress widget refresh timer from 5 seconds to 15 seconds. The widget shows slice/task progress which doesn't change faster than every ~30 seconds anyway.

## Testing Strategy

Each fix has a corresponding test:
1. **Fix 1**: Unit test — verify idle watchdog doesn't throw unhandled rejections
2. **Fix 2**: Unit test — verify `nativeHasChanges` returns cached result within TTL window
3. **Fix 3**: Unit test — verify `clearUnitTimeout()` is called before recovery dispatch
4. **Fix 4**: Unit test — verify isolation cleanup respects timeout
5. **Fix 5**: Integration — verify dead processes are pruned after unit completion
6. **Fix 6**: Unit test — verify STATE.md rebuild is throttled
7. **Fix 7**: Visual inspection — progress widget still updates

## Files Modified

- `src/resources/extensions/gsd/auto.ts` (Fixes 1, 3, 5, 6)
- `src/resources/extensions/gsd/native-git-bridge.ts` (Fix 2)
- `src/resources/extensions/subagent/isolation.ts` (Fix 4)
- `src/resources/extensions/gsd/auto-dashboard.ts` (Fix 7)
- `src/resources/extensions/gsd/tests/` (new test files)

## Risk Assessment

All fixes are **defensive and backward-compatible**:
- No behavior changes for the happy path
- Caching only affects the frequency of side-effect-free reads
- Timer cleanup is additive (clearing timers that should have been cleared)
- Timeout on isolation cleanup already has a fallback path
- Throttling STATE.md is cosmetic (STATE.md is only used for human debugging)
