# Codex Audit: GSD-2 Auto-Mode

The elegant kernel is already present in `src/resources/extensions/gsd/state.ts:142` and `src/resources/extensions/gsd/auto-dispatch.ts:392`. Those two files express the real machine: derive durable workflow state from `.gsd/`, then map that state to the next unit. Most remaining complexity is compensating machinery around two structural gaps:

1. completion is inferred after the fact instead of recorded transactionally
2. the control loop is not fully serialized, so reentrancy and handoff bugs must be patched with flags, retries, and watchdogs

The minimum code that delivers maximum autonomous power is a small serialized runner wrapped around `deriveState()`, `resolveDispatch()`, prompt construction, and unit finalization. Everything else should either become a boundary adapter or disappear.

## 1. Architecture Map

### Current lifecycle

```text
/gsd auto
-> commands.ts
-> auto.ts:startAuto
-> auto-start.ts:bootstrapAutoSession
-> auto.ts:dispatchNextUnit
-> state.ts:deriveState
-> auto-dispatch.ts:resolveDispatch
-> auto-prompts.ts:build*Prompt
-> newSession + sendMessage
-> index.ts:agent_end
-> auto.ts:handleAgentEnd
-> auto-post-unit.ts (pre)
-> auto-verification.ts
-> auto-post-unit.ts (post)
-> dispatchNextUnit
```

### Modules and roles

- `src/resources/extensions/gsd/commands.ts` is the CLI entry surface for `/gsd auto`.
- `src/resources/extensions/gsd/index.ts` is the runtime event hub. It receives `agent_end` and also owns auto-adjacent globals at `index.ts:119`.
- `src/resources/extensions/gsd/auto.ts` is the hot-path orchestrator. It contains startup, dispatch, `handleAgentEnd`, retry logic, watchdogs, and handoff logic. This is still the center of gravity.
- `src/resources/extensions/gsd/auto-start.ts` bootstraps sessions and resume behavior.
- `src/resources/extensions/gsd/state.ts` reduces `.gsd/` files into a single derived workflow state. This is the cleanest part of the system.
- `src/resources/extensions/gsd/auto-dispatch.ts` maps derived state to the next work unit. This is the second clean part of the system.
- `src/resources/extensions/gsd/auto-prompts.ts` turns a selected unit into the agent prompt.
- `src/resources/extensions/gsd/auto-post-unit.ts` performs post-execution handling, auto-commit, hooks, triage, quick-task handling, and completion-side effects.
- `src/resources/extensions/gsd/auto-verification.ts` runs verification after unit execution.
- `src/resources/extensions/gsd/verification-gate.ts` provides the verification gate that `auto-verification.ts` depends on.
- `src/resources/extensions/gsd/auto-recovery.ts`, `auto-idempotency.ts`, `auto-stuck-detection.ts`, `crash-recovery.ts`, and `session-lock.ts` exist largely to recover from or defend against inconsistencies produced by the control loop.
- `src/resources/extensions/gsd/unit-runtime.ts` and session/runtime JSON files persist hot runtime state outside the core workflow model.

### State map

#### Durable workflow state

This is the real project truth and it already lives in `.gsd/`.

- Phase and milestone structure under `.gsd/`
- Roadmap and phase documents parsed by `src/resources/extensions/gsd/files.ts:121`
- Path resolution in `src/resources/extensions/gsd/paths.ts:19`
- Workflow typing in `src/resources/extensions/gsd/types.ts`
- Derived phase/work state reduced in `src/resources/extensions/gsd/state.ts:142`

This state is good: it is mostly declarative, reconstructible, and domain-meaningful.

#### In-memory runtime state

This is where complexity spreads.

- `AutoSession` in `src/resources/extensions/gsd/auto/session.ts:70`
- Auto flags and retry/handoff state in `src/resources/extensions/gsd/auto.ts`
- Globals in `src/resources/extensions/gsd/index.ts:119`
- Hook state in `src/resources/extensions/gsd/post-unit-hooks.ts:23`
- Doctor-related state in `src/resources/extensions/gsd/doctor-proactive.ts:35`
- Worktree coordination in `src/resources/extensions/gsd/worktree.ts:26` and `src/resources/extensions/gsd/auto-worktree.ts:46`
- Lock ownership in `src/resources/extensions/gsd/session-lock.ts:46`
- Caches in `src/resources/extensions/gsd/cache.ts:24`, `state.ts:87`, `files.ts:46`, and `paths.ts:19`

This state is fragmented across modules that each partially believe they own correctness.

#### Durable runtime artifacts

These files are not the workflow truth, but the loop depends on them:

- `auto.lock` via `src/resources/extensions/gsd/crash-recovery.ts:36`
- session ownership files via `src/resources/extensions/gsd/session-lock.ts:143`
- `completed-units.json` via `src/resources/extensions/gsd/auto-recovery.ts:353`
- runtime unit JSON via `src/resources/extensions/gsd/unit-runtime.ts:65`
- verification JSON and other sidecar bookkeeping files

These artifacts exist because the loop cannot always tell, from durable workflow state alone, whether a unit actually completed.

### Verification flow today

Verification is not native to the unit lifecycle. It is a post-pass:

1. `auto.ts:handleAgentEnd`
2. `auto-post-unit.ts` performs pre-verification side effects
3. `auto-verification.ts:45` runs the verification gate
4. on success, post-verification completion proceeds
5. on failure, completion state may be cleared and the unit redispatched

That ordering is the core design mistake. Verification is treated as something that happens after completion logic has already started to mutate the world.

## 2. Root Causes

### 1. Completion is inferred, not transacted

Evidence:

- `src/resources/extensions/gsd/auto-recovery.ts:115` contains unit-specific artifact expectations that try to guess whether work really finished.
- `src/resources/extensions/gsd/auto-idempotency.ts:45` exists to prevent replay damage because the system cannot rely on a single authoritative completion record.
- `src/resources/extensions/gsd/auto-stuck-detection.ts:62` exists because units can appear active, complete, or stalled depending on which artifact was written before interruption.

Root flaw:

The system does not have one atomic notion of "unit completed successfully." Instead it triangulates from markdown mutations, runtime JSON, completion files, agent events, and verification outcomes. Once completion is inferred instead of committed, recovery code, idempotency guards, and artifact-specific heuristics become unavoidable.

### 2. The loop is recursive and event-driven instead of serialized

Evidence:

- `src/resources/extensions/gsd/auto.ts:445` and nearby logic maintain dispatch guards to prevent overlapping dispatch.
- `src/resources/extensions/gsd/auto.ts:765` and nearby logic carry retry/handoff state such as pending agent-end retries.
- `src/resources/extensions/gsd/auto.ts:981` and related code add hang guards and dispatch watchdog behavior.

Root flaw:

The next unit can be triggered from inside completion handling, from retries, from hooks, from quick-task handling, or from recovery paths. That means control flow is not a single queue advancing one step at a time; it is a graph of callbacks that tries to behave like a loop. Reentrancy guards are the symptom.

### 3. State encapsulation is local, not systemic

Evidence:

- `src/resources/extensions/gsd/auto.ts:195` conceptually treats `AutoSession` as the owner of mutable auto state.
- In practice, real correctness still depends on globals in `src/resources/extensions/gsd/index.ts:119`, `post-unit-hooks.ts:23`, `doctor-proactive.ts:35`, `worktree.ts:26`, `auto-worktree.ts:46`, and `session-lock.ts:46`.

Root flaw:

Encapsulation only exists inside individual files. System-wide, state is split between session object, module globals, caches, lock files, and sidecar JSON. That forces every caller to know internal coordination rules and makes state handoff across phases and units easy to get wrong.

### 4. Verification is bolted on after completion-side effects

Evidence:

- `src/resources/extensions/gsd/auto-post-unit.ts:107` performs auto-commit, doctor work, state rebuild, and completion persistence before verification has fully settled the unit.
- `src/resources/extensions/gsd/auto-verification.ts:194` then has to unwind completion state and redispatch on failure.

Root flaw:

Verification should decide whether a unit is done. In the current architecture, the system first behaves as if the unit is done, then later asks whether it was actually done. That reversal creates rollback code, duplicate state transitions, and fragile re-entry behavior.

### 5. Optional powers live inside the core loop

Evidence:

- `src/resources/extensions/gsd/auto-post-unit.ts:333` and surrounding logic dispatch nested sessions for hooks, mechanical completion, triage, and quick tasks.
- `src/resources/extensions/gsd/tests/auto-dispatch-loop.test.ts:9` reads like a bug taxonomy for these nested control paths.

Root flaw:

Features that should be boundary concerns are embedded in the core execution protocol. Once optional work can spawn more work from inside `agent_end`, the core loop is no longer minimal or structurally obvious.

## 3. The Minimal Machine

### Keep the kernel

The auto-mode kernel that should survive is:

- `src/resources/extensions/gsd/state.ts`
- `src/resources/extensions/gsd/auto-dispatch.ts`
- `src/resources/extensions/gsd/auto-prompts.ts`

That is the real architecture: derive current workflow state, select the next unit, prompt the agent, finalize the unit, repeat.

### Replace the orchestration cluster

The following cluster should be collapsed into one serialized runner plus per-unit finalizers:

- `src/resources/extensions/gsd/auto.ts`
- `src/resources/extensions/gsd/auto-start.ts`
- `src/resources/extensions/gsd/auto-post-unit.ts`
- `src/resources/extensions/gsd/auto-verification.ts`

The runner should own one thing only: advancing the machine by exactly one unit at a time.

### Essential state only

The runtime state that appears truly essential is small:

- `runId`
- `mode`
- `activeUnit { type, id, attempt, sessionFile }`
- `pausedReason`
- `worktreeContext`
- an optional small sidecar queue for follow-up units

Everything else should be treated as suspect until justified.

### State that looks like a symptom, not a necessity

These state stores appear to exist because the current machine is not simple enough:

- `completedKeySet`
- `runtime/units/*`
- `pendingVerificationRetry`
- `pendingCrashRecovery`
- `pendingAgentEndRetry`
- `skipDepth`
- hook queues and hook bookkeeping
- most doctor state on the hot path

If completion were transactional and the loop serialized, much of this should disappear.

### Verification belongs inside unit finalization

Verification should not be a post-pass. It should be the final step of the unit driver itself.

For example:

- `execute-task.finalize()` should verify the task outcome
- if verification passes, record completion
- if verification fails, return retry context instead of mutating completion state and rolling it back later

This makes failure a normal branch of execution rather than an exception path after the unit was already "done."

### Optional work should be queued, not nested

Hooks, triage, quick tasks, UAT, reassessment, and similar follow-up behavior should become ordinary sidecar units emitted by finalizers. They should not fork nested control flow from inside the core agent completion path.

### Platonic loop

```ts
while (run.active) {
  const state = deriveState(base)
  const unit = dequeueSidecar() ?? resolveDispatch(state)
  const session = await newSession()
  await send(buildPrompt(unit, state))
  const result = await finalize(unit, base)
  if (result.retry) requeue(unit, result.context)
  else enqueue(result.sidecars)
}
```

This loop is small, obvious, and structurally aligned with autonomy:

- state is derived, not hand-maintained
- one unit is active at a time
- verification is part of finalization
- follow-up work is queued, not recursively dispatched
- recovery only needs to restore one active unit and one queue

## 4. Migration Path

1. Add a single durable `RunState` file and dual-write it beside current lock/runtime files.
   The first goal is not deletion. The first goal is to establish one authoritative runtime record without breaking the current system.

2. Introduce `UnitDriver` finalizers, starting with `execute-task`.
   This is the most valuable first slice because verification and completion currently collide there. Make `execute-task` transactional before touching everything else.

3. Move hooks, triage, quick tasks, and mechanical completion into a sidecar queue.
   Once follow-up behavior is queued instead of nested, delete the nested dispatch behavior in `src/resources/extensions/gsd/auto-post-unit.ts`.

4. Collapse lock ownership and crash metadata into the single run-state boundary.
   After that, remove `completed-units.json`, most of `src/resources/extensions/gsd/unit-runtime.ts`, and large parts of `auto-idempotency.ts` and `auto-stuck-detection.ts`.

5. Demote doctor to startup/manual repair instead of normal hot-path execution.
   `src/resources/extensions/gsd/doctor.ts:352` should not be part of standard unit-to-unit handoff if finalization becomes deterministic.

## Closing Judgment

The system already contains the elegant answer. It is not buried in the retries, guards, and recovery helpers. It is buried in the state reducer and the dispatcher.

The minimum machine is:

- derive workflow state from durable files
- select one next unit
- execute it
- finalize it transactionally, including verification
- queue any follow-up work
- repeat

Most of the present code exists because the system currently tries to reconstruct that simple machine indirectly.

## Validation Notes

I attempted targeted validation while auditing:

- `src/resources/extensions/gsd/tests/agent-end-retry.test.ts` ran directly and passed.
- `src/resources/extensions/gsd/tests/auto-dispatch-loop.test.ts` and `session-lock-regression.test.ts` did not run raw with `node --test` in this workspace because they import `.js` build outputs that were not present in that invocation mode.
