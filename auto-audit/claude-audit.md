# GSD Auto-Mode Deep Audit: The Minimal Machine

**~9,800 lines across 22 files** power the auto loop. The question: what's the minimum code that delivers maximum autonomous power?

---

## 1. Architecture Map — What Exists Today

### The Loop

```
startAuto()
  └─ bootstrapAutoSession() [auto-start.ts, 483 lines]
       └─ dispatchNextUnit() [auto.ts, ~680 lines of the 1835]
            ├─ deriveState() [state.ts, 727 lines] → reads .gsd/ files → returns phase
            ├─ resolveDispatch() [auto-dispatch.ts, 409 lines] → phase → unit type/prompt
            ├─ checkIdempotency() [auto-idempotency.ts, 151 lines] → skip/rerun/proceed
            ├─ checkStuckAndRecover() [auto-stuck-detection.ts, 221 lines] → loop detection
            ├─ newSession() + sendMessage(prompt)
            └─ startUnitSupervision() [auto-timers.ts, 224 lines] → watchdogs
                 │
                 ▼ (agent runs, completes)
            handleAgentEnd()
            ├─ postUnitPreVerification() [auto-post-unit.ts, ~220 lines] → commit, doctor, artifacts
            ├─ runPostUnitVerification() [auto-verification.ts, 229 lines] → typecheck/lint/test
            ├─ postUnitPostVerification() [auto-post-unit.ts, ~300 lines] → hooks, triage, quick-tasks
            └─ dispatchNextUnit() → loop
```

### Supporting Cast

| File | Lines | Role |
|------|-------|------|
| auto-recovery.ts | 578 | Artifact resolution, skip artifacts, merge reconciliation, self-heal |
| auto-start.ts | 483 | Bootstrap: git init, crash recovery, worktree, secrets, guided flow gate |
| auto-worktree.ts | 658 | Worktree lifecycle per milestone |
| auto-prompts.ts | 1273 | Prompt builders per unit type |
| auto-dashboard.ts | 626 | TUI progress widget |
| auto-post-unit.ts | 618 | Post-unit processing (hooks, triage, quick-tasks, mechanical completion) |
| auto-dispatch.ts | 409 | Dispatch rules table |
| auto-timeout-recovery.ts | 263 | Timeout recovery strategies |
| auto/session.ts | 236 | State container (AutoSession class) |
| auto-verification.ts | 229 | Verification gate + auto-fix retry |
| auto-timers.ts | 224 | 4 supervision timers |
| auto-stuck-detection.ts | 221 | Loop detection + stub recovery |
| auto-model-selection.ts | 179 | Model routing (light/standard/heavy) |
| auto-idempotency.ts | 151 | Skip completed units + loop detection |
| auto-direct-dispatch.ts | 224 | Direct dispatch for hook units |
| auto-observability.ts | 72 | Warning collection |
| auto-supervisor.ts | 61 | SIGTERM handler, working tree activity |
| auto-tool-tracking.ts | 54 | In-flight tool tracking |
| auto-unit-closeout.ts | 48 | Metrics snapshot on unit end |
| auto-budget.ts | 32 | Budget alert level calculation |
| auto-constants.ts | 6 | STATE_REBUILD_MIN_INTERVAL_MS |

### State (AutoSession): 30+ mutable properties

```
Lifecycle:     active, paused, pausedForSecrets, stepMode, verbose, cmdCtx
Paths:         basePath, originalBasePath, gitService
Counters:      unitDispatchCount, unitLifetimeDispatches, unitRecoveryCount,
               unitConsecutiveSkips, completedKeySet
Timers:        unitTimeoutHandle, wrapupWarningHandle, idleWatchdogHandle,
               continueHereHandle, dispatchGapHandle
Current:       currentUnit, currentUnitRouting, completedUnits, currentMilestoneId
Model:         autoModeStartModel, originalModelId, originalModelProvider, lastBudgetAlertLevel
Recovery:      pendingCrashRecovery, pendingVerificationRetry, verificationRetryCount,
               pausedSessionFile, resourceVersionOnStart, lastStateRebuildAt
Guards:        handlingAgentEnd, pendingAgentEndRetry, dispatching, skipDepth, recentlyEvictedKeys
Metrics:       autoStartTime, lastPromptCharCount, lastBaselineCharCount, pendingQuickTasks
Signal:        sigtermHandler
```

---

## 2. Root Causes — The 3-5 Structural Flaws

### Root Cause 1: deriveState() and the dispatch loop disagree on "done"

**The fundamental disease.** `deriveState()` determines the phase by reading files. The dispatch loop determines "done" by checking `completedKeySet` + `verifyExpectedArtifact()`. These are two different truth systems that frequently disagree:

- `verifyExpectedArtifact()` in auto-recovery.ts (lines 115-237) has **7 special-case validators** beyond "does the file exist":
  - validate-milestone: must have terminal verdict in frontmatter
  - plan-slice: must have task entries matching `^- \[[xX ]\] \*\*T\d+:/m`
  - plan-slice: must also have individual T{id}-PLAN.md files for every task
  - execute-task: must also have `[x]` checkbox in slice plan
  - complete-slice: must have UAT file AND slice marked `[x]` in roadmap
  - rewrite-docs: must have no active overrides
  - hook units: always pass

When these disagree with what `deriveState()` returns as the phase, the loop enters skip/stuck/eviction cycles. **This is the #1 source of bugs** — issues #176, #313, #431, #699, #739, #790, #832, #909 all stem from this disagreement.

**Evidence:** The idempotency module (auto-idempotency.ts) has 5 different outcomes (skip, rerun, proceed, stop, + 4 skip sub-reasons) because it's mediating between two truth systems. The stuck detection module writes **stub summaries** and **force-marks checkboxes** to make the two systems agree — brute-forcing consensus rather than having one source of truth.

### Root Cause 2: dispatchNextUnit() is a 680-line god function doing 15 things

Despite extracting 7 modules, `dispatchNextUnit()` in auto.ts still:

1. Validates session lock
2. Checks reentrancy guard
3. Checks skip depth recursion
4. Checks resource staleness
5. Invalidates caches
6. Runs pre-dispatch health gate
7. Derives state
8. Handles milestone transitions (65 lines including merge, worktree, report generation)
9. Handles blocked/complete/no-milestone cases
10. Runs budget ceiling guard (45 lines with 4 alert levels)
11. Runs context window guard
12. Runs secrets gate
13. Handles needs-discussion routing
14. Resolves dispatch + runs pre-dispatch hooks
15. Runs idempotency + stuck detection
16. Closes out previous unit + records completion
17. Creates new session + injects prompt
18. Starts supervision timers

The milestone transition block alone (lines 1067-1176) has inline report generation, worktree merge, integration branch capture, and queue pruning. The budget guard (1272-1316) has 4 threshold checks with near-identical notification patterns.

**Why this matters:** Every new feature or fix adds lines to this function. The reentrancy guard, skip depth guard, dispatch gap watchdog, and dispatch hang guard all exist because this function is too complex to reason about its own control flow.

### Root Cause 3: Dual completion tracking — memory + disk, never in sync

Completion state exists in **three places**:

1. `s.completedKeySet` (in-memory Set) — the runtime authority
2. `.gsd/completed-units.json` (disk file) — persisted for resume
3. The artifacts themselves (files on disk) — the ground truth

The system constantly reconciles between these:
- `loadPersistedKeys()` → disk to memory on startup
- `persistCompletedKey()` → memory to disk on completion
- `removePersistedKey()` → eviction from disk on stale detection
- `selfHealRuntimeRecords()` → re-derives from artifacts to fix drift
- `verifyExpectedArtifact()` → cross-checks artifacts against keys

The "recently evicted keys" set (`s.recentlyEvictedKeys`) exists specifically to prevent the fallback path in idempotency from re-persisting a key that was just evicted. This is a guard on a guard on a guard.

**The clean alternative:** The artifacts ARE the state. If `deriveState()` correctly returns the phase, you don't need completion tracking at all — you just ask "what's the next unit?" and if it's different from the last one, the last one is done.

### Root Cause 4: Post-unit processing has become a second dispatch system

`postUnitPostVerification()` in auto-post-unit.ts (lines 333-618) is a 285-line function that can dispatch 3 different unit types on its own:

1. **Post-unit hooks** (lines 385-467) — creates a new session, sends a message
2. **Triage captures** (lines 469-549) — creates a new session, sends a message
3. **Quick-tasks** (lines 551-609) — creates a new session, sends a message

Each of these duplicates the session creation pattern: `newSession()` → `writeLock()` → set timeout → `sendMessage()`. This is the same 20-line pattern copied 3 times in one function, plus 2 more in `dispatchHookUnit()` and `dispatchNextUnit()`.

This creates the reentrancy bug (#1072): a unit dispatched inside `handleAgentEnd` can complete before the outer `handleAgentEnd` returns, causing a dropped `agent_end` event. The fix was `s.pendingAgentEndRetry` — another guard flag.

### Root Cause 5: Worktree isolation is interleaved with core loop logic

Worktree management code is woven through:
- `auto.ts` lines 211-216, 378-435, 489-501, 624-672, 1137-1170 — inline worktree checks and transitions
- `auto-start.ts` lines 214-352 — survivor branch recovery, worktree setup
- `auto-worktree.ts` 658 lines — the actual worktree operations

The `tryMergeMilestone()` helper was extracted from "4 duplicate merge blocks" (per the comment at line 373). But worktree state still mutates `s.basePath` inline, and every path operation must ask "am I in a worktree?" to get the right base path.

`s.originalBasePath` exists solely because worktree isolation overwrites `s.basePath`. Every lock operation uses `lockBase()` which returns `s.originalBasePath || s.basePath`. This two-path reality infects the entire system.

---

## 3. The Minimal Machine

### Principle: Make the loop structurally simple, push complexity to the edges

The current system has ~15 concerns interleaved in the dispatch loop. The minimal machine separates them into 3 layers:

```
Layer 1: The Loop (what to do next)
Layer 2: The Unit Runner (do it)
Layer 3: The Edge Concerns (everything else)
```

### The Loop — ~100 lines

```typescript
async function autoLoop(session: AutoSession): Promise<void> {
  while (session.active) {
    // 1. Derive state (single source of truth)
    const state = await deriveState(session.basePath);

    // 2. Resolve next unit (pure function: state → unit | stop)
    const next = resolveNextUnit(state, session.basePath);
    if (next.action === "stop") {
      await session.stop(next.reason);
      return;
    }

    // 3. Check resource limits (budget, context)
    const limit = checkLimits(session);
    if (limit) {
      await session.pause(limit.reason);
      return;
    }

    // 4. Run the unit
    await runUnit(session, next.unitType, next.unitId, next.prompt);

    // 5. Post-unit processing (commit, verify, doctor)
    await postUnit(session);
  }
}
```

**What disappeared:**
- **Idempotency checks** — gone. `deriveState()` returns the phase, `resolveNextUnit()` maps it to a unit. If the phase changed (because the artifact was written), the next unit is different. No completion tracking needed.
- **Stuck detection** — gone. If `deriveState()` returns the same phase twice, increment a counter. After N attempts, stop. No per-unit maps, no lifetime caps, no stub recovery.
- **Skip loops** — structurally impossible. There's no skip. You derive → dispatch → run → derive. The next state is always computed from disk.
- **Reentrancy guards** — gone. The loop is a simple `while`, not a recursive chain of dispatches-inside-dispatches. Post-unit hooks queue work for the next iteration.
- **Dispatch gap watchdog** — gone. The loop either runs the next iteration or exits. There's no gap to detect.
- **Dispatch hang guard** — reduced to a single timeout on `runUnit()`.

### deriveState() becomes the ONLY truth

The current `verifyExpectedArtifact()` duplicates phase logic with 7 special cases. The fix: **delete it**. If `deriveState()` says the phase is "executing" with task T03, that IS the state. If the agent just wrote T02's summary and checked its box, `deriveState()` will return T03 next time.

The only addition: `deriveState()` should return `{ sameAsPrevious: boolean }` so the loop can count stuck iterations. No separate tracking needed.

### resolveNextUnit() is a pure function

Same as current `resolveDispatch()` (auto-dispatch.ts) — this is already well-designed. The dispatch table is clean. Keep it.

### runUnit() encapsulates the session lifecycle

```typescript
async function runUnit(session, unitType, unitId, prompt): Promise<void> {
  await session.newSession();
  session.updateLock(unitType, unitId);

  const timeout = startTimeout(session, unitType, unitId);
  try {
    session.sendMessage(prompt);
    await session.waitForAgentEnd();
  } finally {
    timeout.clear();
  }
}
```

All prompt augmentation (verification retry, crash recovery, retry diagnostic) becomes a prompt middleware:

```typescript
const augmentedPrompt = augmentPrompt(prompt, {
  verificationFailure: session.pendingVerification,
  crashRecovery: session.pendingCrashRecovery,
  retryCount: session.retryCount(unitType, unitId),
});
```

### postUnit() is a pipeline, not a dispatch system

Currently `postUnitPostVerification()` can dispatch hooks, triage, and quick-tasks inline. Instead:

```typescript
async function postUnit(session): Promise<void> {
  // 1. Commit
  await autoCommit(session);

  // 2. Doctor (mechanical fixes)
  await runDoctor(session);

  // 3. Verification (only for execute-task)
  if (session.currentUnit.type === "execute-task") {
    const result = await verify(session);
    if (!result.passed && session.canRetry()) {
      session.queueRetry(result.failureContext);
      return; // next loop iteration handles retry
    }
    if (!result.passed) {
      await session.pause("Verification failed");
      return;
    }
  }

  // 4. Queue hooks/triage/quick-tasks for NEXT iteration
  session.queuePostUnitWork();
}
```

Hooks, triage, and quick-tasks become entries in a work queue that the main loop picks up on the next iteration — not inline dispatches that create reentrancy.

### Worktree isolation becomes a path resolver

Instead of mutating `s.basePath` and `s.originalBasePath`:

```typescript
class WorktreeResolver {
  constructor(private projectRoot: string) {}

  resolve(milestoneId: string): string {
    if (this.isolation === "none") return this.projectRoot;
    return this.worktreePath(milestoneId);
  }

  lockPath(): string {
    return this.projectRoot; // always
  }
}
```

The session always knows both paths. No `lockBase()` wrapper needed.

---

## 4. What Gets Eliminated

### Files that could be deleted entirely:

| File | Lines | Why |
|------|-------|-----|
| auto-idempotency.ts | 151 | Completion tracking eliminated by deriveState-as-truth |
| auto-stuck-detection.ts | 221 | Stuck detection becomes a 10-line counter in the loop |
| auto-unit-closeout.ts | 48 | Merged into postUnit() |
| auto-constants.ts | 6 | Constants move to session.ts |
| auto-direct-dispatch.ts | 224 | Hook dispatch unified with main loop |

**Total: 650 lines eliminated**

### Code that could be drastically simplified:

| File | Current | Target | Savings |
|------|---------|--------|---------|
| auto.ts | 1835 | ~500 | 1335 |
| auto-recovery.ts | 578 | ~200 | 378 (delete verifyExpectedArtifact, skip logic, merge reconciliation) |
| auto-post-unit.ts | 618 | ~200 | 418 (no inline dispatches, work queue instead) |
| auto-start.ts | 483 | ~250 | 233 (worktree setup simplified by resolver) |
| auto/session.ts | 236 | ~150 | 86 (fewer state properties needed) |

**Total reduction: ~3,100 lines from ~9,800 → ~6,700 lines (33% reduction)**

But the real win isn't line count — it's **eliminated bug categories**:
- Skip loops: structurally impossible
- Completion key drift: no completion keys
- Reentrancy bugs: no recursive dispatch
- Dispatch gaps: no gaps (it's a while loop)
- Dual-truth disagreements: one truth (deriveState)

---

## 5. Migration Path

### Phase 1: Unify truth (LOW RISK, HIGH VALUE)

Delete `verifyExpectedArtifact()`. Make `deriveState()` the sole authority on "is this unit done?"

**How:**
1. Add a `previousPhase` parameter to `dispatchNextUnit()`
2. If `deriveState()` returns the same (phase, milestone, slice, task) as last time, increment a retry counter
3. After MAX_RETRIES, stop (replaces stuck detection)
4. Delete checkIdempotency, checkStuckAndRecover, and all completion key tracking

**Risk:** Low. `deriveState()` is already correct — the completion tracking exists only because it used to be wrong and the fixes were applied as overlays.

**Test:** Run the existing auto-dispatch-loop regression harness (125 assertions). If state derivation returns the right phase, the dispatch table routes correctly.

### Phase 2: Linearize the loop (MEDIUM RISK)

Convert from recursive dispatch (dispatchNextUnit calls itself via setImmediate/setTimeout) to a `while` loop.

**How:**
1. Make `handleAgentEnd()` set a flag + resolve a promise instead of calling `dispatchNextUnit()`
2. The main loop awaits the promise, then iterates
3. Post-unit hooks/triage/quick-tasks become entries in a queue consumed by the loop

**Risk:** Medium. This changes the control flow. The gap watchdog and hang guard become unnecessary, but need to verify no edge case relies on the recursive pattern.

### Phase 3: Isolate worktree logic (LOW RISK)

Replace `s.basePath` / `s.originalBasePath` mutation with a `WorktreeResolver`.

**How:**
1. Introduce `WorktreeResolver` that encapsulates path resolution
2. All code that uses `s.basePath` goes through `resolver.workPath()`
3. All code that uses `lockBase()` goes through `resolver.lockPath()`
4. Worktree transitions become `resolver.enterMilestone(mid)` / `resolver.exitMilestone()`

**Risk:** Low. Pure refactor, behavior doesn't change.

### Phase 4: Simplify post-unit processing (LOW RISK)

Convert inline dispatches to a work queue.

**How:**
1. `postUnitPostVerification()` returns `{ queuedWork: WorkItem[] }` instead of calling `sendMessage()`
2. The main loop checks the queue before deriving state
3. Delete the reentrancy guard (`s.handlingAgentEnd`, `s.pendingAgentEndRetry`)

**Risk:** Low. The behavior is the same, just the control flow is linearized.

---

## 6. Where the Elegance Is Hiding

Three things in this system are genuinely well-designed:

1. **The dispatch table** (auto-dispatch.ts) — declarative, ordered rules. Each rule is a pure function. Testable per-rule. This is what the whole system should look like.

2. **deriveState()** (state.ts) — reads files, returns phase. No side effects. The batch-parse optimization is clean. This is already the right truth source — it just needs to be the ONLY one.

3. **The AutoSession class** (auto/session.ts) — consolidating mutable state into one place was the right move. It just has too many properties because the current architecture needs too much tracking state.

The minimal machine keeps these three and strips everything else to the minimum needed to connect them into a loop.
