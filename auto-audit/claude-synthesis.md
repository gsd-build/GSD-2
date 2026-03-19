# Three-Model Synthesis: GSD Auto-Mode Audit

Three models (Claude, Codex, Gemini) independently audited ~9,800 lines of auto-mode code. This document captures where they converge, where they diverge, and what the combined signal says about the path forward.

---

## Universal Agreement (All Three)

### The kernel is already correct

All three audits identify the same two files as the real machine:

- **`state.ts:deriveState()`** — pure function, reads `.gsd/` files, returns phase
- **`auto-dispatch.ts:resolveDispatch()`** — declarative rule table, maps phase to unit

Every auditor says: keep these, strip everything else to the minimum needed to connect them into a loop. The architecture is already right at the core — the problem is the layers of compensation around it.

### Root cause #1: Two truth systems for "done"

| Claude | Codex | Gemini |
|--------|-------|--------|
| "`deriveState()` and the dispatch loop disagree on done" — 7 special-case validators in `verifyExpectedArtifact()` duplicate phase logic | "Completion is inferred, not transacted" — triangulates from markdown, runtime JSON, completion files, agent events, and verification | "O(N) world scanning" + `completedKeySet` and `recentlyEvictedKeys` exist because the system has no persistent memory |

**Converged diagnosis:** The system maintains completion state in three places (in-memory Set, disk JSON, actual artifacts) and constantly reconciles between them. `verifyExpectedArtifact()` reimplements `deriveState()` logic with different special cases, creating disagreements that spawn skip loops, eviction cycles, and stub recovery.

**Converged fix:** Make `deriveState()` the sole authority. Delete `verifyExpectedArtifact()`, `completedKeySet`, `completed-units.json`, and the idempotency/stuck-detection modules. If the state machine says "next unit is X," that's the truth.

### Root cause #2: Reactive recursion instead of a linear loop

| Claude | Codex | Gemini |
|--------|-------|--------|
| "`dispatchNextUnit()` is a 680-line god function doing 15 things" — recursive dispatch via `setImmediate`/`setTimeout` creates reentrancy | "The loop is recursive and event-driven instead of serialized" — next unit triggered from completion, retries, hooks, quick-tasks, recovery | "The Async Recursion Tax" — `s.dispatching`, `s.handlingAgentEnd`, `s.pendingAgentEndRetry`, `s.skipDepth` are all traffic control |

**Converged diagnosis:** The loop should be `while (active) { derive → dispatch → run → finalize }`. Instead, it's a callback graph that tries to behave like a loop. Every guard flag (`dispatching`, `handlingAgentEnd`, `pendingAgentEndRetry`, `skipDepth`) and every watchdog (`dispatchGapHandle`, `DISPATCH_HANG_TIMEOUT_MS`) exists because the control flow isn't linear.

**Converged fix:** Replace with a `while` loop. `handleAgentEnd` resolves a promise; the loop awaits it and iterates. Reentrancy guards, gap watchdogs, and hang guards become unreachable dead code.

### Root cause #3: Post-unit processing is a second dispatch system

| Claude | Codex | Gemini |
|--------|-------|--------|
| `postUnitPostVerification()` dispatches 3 unit types inline (hooks, triage, quick-tasks), each duplicating the session creation pattern | "Optional powers live inside the core loop" — nested sessions spawn more work from inside `agent_end` | "Leakage of mechanical logic" — Doctor and Mechanical Completion are janitor systems on the hot path |

**Converged fix:** Hooks, triage, and quick-tasks become entries in a work queue. The main loop dequeues them on the next iteration. No inline dispatch, no reentrancy.

### Root cause #4: Verification is bolted on after completion

| Claude | Codex | Gemini |
|--------|-------|--------|
| Verification retry creates `pendingVerificationRetry` which augments the next prompt — splitting one task across two sessions | "Verification should decide whether a unit is done" — system behaves as if done, then asks if it was | "Bolted-on verification" — fails trigger a "fake" new dispatch with failure context |

**Converged fix:** Verification belongs inside unit finalization. `finalize()` runs verification; if it fails, the unit is retried (same iteration or next), not "re-dispatched" through the entire loop machinery.

### The platonic loop

All three converge on essentially the same pseudocode:

```typescript
while (run.active) {
  const state = deriveState(base)
  const unit = dequeueWork() ?? resolveDispatch(state)
  if (!unit) break

  await runUnit(unit)
  const result = await finalize(unit)

  if (result.retry) requeue(unit, result.context)
  else enqueue(result.sidecars) // hooks, triage, quick-tasks
}
```

---

## Where the Audits Diverge

### deriveState: keep scanning vs. build a graph

**Gemini** proposes replacing `deriveState()` with an incremental work graph — unit completion emits effects, the graph updates only affected nodes, disk becomes a persistence layer.

**Claude and Codex** say keep `deriveState()` as-is. It's already correct, it's pure, and the Rust batch parser makes it fast enough. An incremental graph adds a new truth source that must stay synchronized with disk — the exact problem we're trying to eliminate.

**Verdict:** Keep scanning. The Rust parser reads the entire `.gsd/` tree in one call. The cost of re-deriving is low; the cost of maintaining a second truth source is high. Gemini's incremental graph would be an optimization for a problem that doesn't exist yet.

### Unit encapsulation: classes vs. functions

**Gemini** proposes `Unit` classes with a `TaskUnit.run()` method that owns session, verification, and retry internally.

**Claude** proposes `runUnit()` as a plain function and `postUnit()` as a pipeline.

**Codex** proposes `UnitDriver` finalizers — per-unit-type finalization logic extracted from the orchestrator.

**Verdict:** The Codex framing is sharpest. Unit-type-specific logic should live in finalizers, not in classes. The orchestrator calls `finalize(unitType, ...)` which dispatches to the right finalizer. No class hierarchy needed — the dispatch table already handles unit selection.

### Doctor: hot path vs. startup only

**Codex** says demote Doctor to startup/manual repair — if finalization becomes deterministic, the janitor is unnecessary.

**Claude** keeps Doctor in `postUnit()` as a mechanical fix pass.

**Gemini** identifies Doctor as "leakage" but doesn't fully remove it.

**Verdict:** Doctor stays on the hot path, but scoped. The LLM is unreliable at updating `.gsd/` files correctly — that's a fact of the system, not a flaw to be designed away. But Doctor should be a single `fixMechanicalIssues()` call in `postUnit()`, not the multi-step health/escalation/heal pipeline it is today.

### Migration ordering

| Claude | Codex | Gemini |
|--------|-------|--------|
| Phase 1: Unify truth (delete verifyExpectedArtifact) | Phase 1: Add RunState file (dual-write alongside current) | Phase 1: Linearize entry point (wrap dispatchNextUnit in promise) |
| Phase 2: Linearize loop | Phase 2: UnitDriver finalizers (start with execute-task) | Phase 2: Extract Unit classes |
| Phase 3: WorktreeResolver | Phase 3: Sidecar queue | Phase 3: Incremental graph |
| Phase 4: Work queue | Phase 4: Collapse locks | Phase 4: Prune guards |

**Verdict — combined ordering:**

1. **Unify truth** (Claude Phase 1). Delete `verifyExpectedArtifact()` and completion key tracking. Highest value, lowest risk. Codex's "dual-write RunState" is unnecessary if we trust `deriveState()`.

2. **Sidecar queue** (Claude Phase 4, Codex Phase 3). Move hooks/triage/quick-tasks to a queue. This can be done inside the current architecture without linearizing the loop first, and it immediately eliminates the reentrancy bug class.

3. **Linearize the loop** (Claude Phase 2). Convert to `while` loop. This is medium risk but eliminates the most guard code. Do it after the queue change so there's less control flow to reason about.

4. **WorktreeResolver** (Claude Phase 3). Pure refactor, can happen anytime. Decouples worktree from core loop.

---

## What All Three Missed (or Understated)

### The prompt system is 1,273 lines and untouched

`auto-prompts.ts` is the largest auto-mode file. No audit questioned whether the prompts are the right abstraction. Each prompt builder (13 of them) constructs a multi-section markdown document with inline file contents. The prompt construction is tightly coupled to the file layout.

If the loop becomes simple, the prompts become the dominant complexity. Worth auditing separately.

### Crash recovery has diminishing returns

All audits mention crash recovery but none question its value. The crash recovery system (synthesizing tool calls from session files, injecting recovery context) is ~200 lines of forensics code that fires rarely and provides marginal value — the agent usually does fine starting fresh from disk state. In a linear loop with `deriveState()` as truth, crash recovery becomes: restart the loop. The artifacts on disk tell you where you are.

### The dashboard and observability layer is 700+ lines

`auto-dashboard.ts` (626 lines) and `auto-observability.ts` (72 lines) are presentation concerns mixed into orchestration. Not a structural flaw, but worth extracting cleanly as the loop simplifies.

---

## The Bottom Line

Three independent auditors, three different analytical styles, one answer:

**The machine is `deriveState()` → `resolveDispatch()` → run → finalize → repeat.**

Everything else is either:
- **Compensation for dual truth** (idempotency, stuck detection, completion keys, artifact verification) — delete it
- **Compensation for recursive control flow** (reentrancy guards, gap watchdogs, hang guards, pendingAgentEndRetry) — linearize it away
- **Legitimate edge concern** (worktree, budget, verification, crash recovery) — push to boundaries
- **Presentation** (dashboard, notifications, reports) — extract cleanly

The migration is 4 phases, each independently deployable, each low-to-medium risk. Phase 1 (unify truth) delivers the most value for the least risk and should be executed first.
