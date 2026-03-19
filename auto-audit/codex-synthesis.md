# Codex Synthesis: GSD-2 Auto-Mode

After reading `gemini-audit.md`, `claude-audit.md`, and `codex-audit.md`, the combined conclusion is clear:

The auto-mode system is not fundamentally broken because it lacks features. It is bloated because a simple machine is being implemented through recursive events, multiple truth systems, and post-hoc repair code.

All three audits independently converge on the same core judgment:

- the elegant kernel already exists in `src/resources/extensions/gsd/state.ts`
- the dispatch rules in `src/resources/extensions/gsd/auto-dispatch.ts` are already close to the right abstraction
- most of the surrounding complexity is compensating for control-flow and state-model flaws, not missing capability

The strongest synthesis is:

1. keep `.gsd/` files as the workflow truth
2. run the machine through one serialized loop
3. make verification part of unit finalization
4. keep only a tiny durable runtime state for the active unit and queued side work
5. delete completion tracking and recovery overlays that exist only because the loop is not structurally simple

## 1. Where All Three Audits Agree

### A. The current loop is too reactive

All three audits identify the same central problem: auto-mode behaves like an event-driven recursive dispatcher instead of a serialized executor.

- Gemini frames this as the "Async Recursion Tax"
- Claude calls out `dispatchNextUnit()` plus `handleAgentEnd()` as the god-loop with reentrancy scars
- Codex describes the system as a callback graph pretending to be a loop

This agreement matters because it explains most of the flags and guards:

- `dispatching`
- `handlingAgentEnd`
- `pendingAgentEndRetry`
- `skipDepth`
- gap watchdogs
- hang guards

These are not isolated bugs. They are structural compensation.

### B. `state.ts` and `auto-dispatch.ts` are the real kernel

All three audits point to the same elegant center:

- `src/resources/extensions/gsd/state.ts`
- `src/resources/extensions/gsd/auto-dispatch.ts`

These files already encode the right mental model:

- derive the current project/workflow state from durable files
- map that state to the next unit of work

That is the machine.

### C. Verification is in the wrong place

All three audits agree that verification is bolted on after completion-side effects rather than being part of completion itself.

Current pattern:

1. agent ends
2. post-unit side effects run
3. verification runs
4. failure may trigger rollback, retry, or redispatch

The synthesis is unambiguous: verification belongs inside unit finalization, especially for `execute-task`.

### D. Inline post-unit dispatch is a design mistake

Hooks, triage, quick-tasks, mechanical completion, and related follow-up behaviors should not spawn nested dispatch flows from inside `handleAgentEnd()`.

All three audits independently recommend the same fix:

- treat follow-up work as queued sidecar units
- let the main loop consume them on the next iteration

That change alone removes an entire class of dropped-event and reentrancy bugs.

### E. Much of the current state is symptom-state

The audits vary in wording, but they agree that large portions of runtime state exist only because the loop is compensating for its own ambiguity.

Examples repeatedly identified across the audits:

- `completedKeySet`
- `completed-units.json`
- `pendingVerificationRetry`
- `pendingAgentEndRetry`
- `recentlyEvictedKeys`
- skip/stuck bookkeeping
- runtime unit sidecars

## 2. Where the Audits Actually Diverge

The audits mostly agree on diagnosis. The real divergence is in the replacement architecture.

### Divergence 1: Should the new truth live on disk or in memory?

- Gemini proposes an in-memory `WorkGraph` as the main execution engine, with disk becoming persistence.
- Claude argues `deriveState()` should become the only authority and that the artifacts on disk are enough.
- Codex argues for a middle ground: keep workflow truth on disk, but maintain a tiny durable `RunState` for runtime-only concerns.

### Synthesis Judgment

Claude plus Codex is the stronger path.

Do **not** introduce a full in-memory `WorkGraph` as the primary truth model in the first redesign. That is a larger abstraction than the current system has earned. It may become a useful optimization later, but it is not the minimum code that delivers maximum autonomous power.

The cleaner design is:

- workflow truth remains derived from `.gsd/` through `deriveState()`
- runtime truth is limited to a small `RunState` file that tracks only the active unit and queued side work

This keeps the machine simple without throwing away crash recovery or resumability.

### Divergence 2: Should there be any explicit runtime completion state?

- Claude pushes hardest toward "no completion tracking at all"
- Codex argues that runtime still needs a transactional record of the active unit and its finalization boundary

### Synthesis Judgment

Delete **completion-key tracking**, but keep **active-unit transactional state**.

That means:

- no `completedKeySet`
- no `completed-units.json`
- no artifact-guessing layer like `verifyExpectedArtifact()`

But still keep:

- current active unit
- current attempt number
- queued sidecars
- whether a unit is mid-finalization

This is the minimum runtime state needed to survive crashes without rebuilding old complexity.

### Divergence 3: How ambitious should the redesign be?

- Gemini leans toward a more opinionated engine abstraction (`Unit`, `WorkGraph`, `engine.sync`)
- Claude is more aggressive about deleting modules immediately
- Codex emphasizes unit finalizers and boundary cleanup first

### Synthesis Judgment

Take Codex's migration posture, Claude's aggressiveness about deleting false authorities, and Gemini's insistence on serialized execution.

In practice:

- simplify control flow first
- unify truth second
- optimize derivation only if performance proves it necessary

## 3. The Minimal Machine

### Core rule

The machine should have:

- one workflow truth source
- one active unit at a time
- one place where a unit becomes complete
- one queue for follow-up work
- one serialized runner

### Recommended architecture

#### Keep mostly intact

- `src/resources/extensions/gsd/state.ts`
- `src/resources/extensions/gsd/auto-dispatch.ts`
- `src/resources/extensions/gsd/auto-prompts.ts`

#### Collapse into a smaller runner/finalizer model

- `src/resources/extensions/gsd/auto.ts`
- `src/resources/extensions/gsd/auto-start.ts`
- `src/resources/extensions/gsd/auto-post-unit.ts`
- `src/resources/extensions/gsd/auto-verification.ts`

#### Demote to edge concerns

- `doctor.ts` and doctor-adjacent modules
- worktree switching
- session locking
- timers/watchdogs
- observability/dashboard code

These should adapt to the loop, not define the loop.

### The recommended state model

#### Workflow truth

Derived each iteration from `.gsd/`:

- milestone
- phase
- slice
- task
- blocked/complete/needs-discussion routing state

#### Runtime truth

Persisted in a tiny `RunState` record:

```ts
type RunState = {
  runId: string
  mode: "auto" | "step"
  activeUnit: {
    type: string
    id: string | null
    attempt: number
    sessionFile: string | null
    stage: "running" | "finalizing"
  } | null
  pausedReason: string | null
  worktreeContext: {
    projectRoot: string
    workPath: string
    milestoneId: string | null
  }
  sidecarQueue: Array<{ type: string; payload?: unknown }>
}
```

Nothing more should be added unless the loop demonstrably cannot function without it.

### The recommended control loop

```ts
while (run.active) {
  const workflow = deriveState(basePath)
  const queued = dequeueSidecar(run)
  const unit = queued ?? resolveDispatch(workflow)

  if (!unit) {
    pauseOrStop(run, workflow)
    break
  }

  beginUnit(run, unit)
  const session = await newSession()
  await send(buildPrompt(unit, workflow))

  const result = await finalizeUnit(unit, run, workflow)

  if (result.kind === "retry") {
    requeueRetry(run, unit, result.context)
    continue
  }

  commitUnit(run, result.sidecars)
}
```

### The critical design choices

#### 1. `deriveState()` remains the workflow authority

Do not preserve a second "done" model in `auto-recovery.ts`, `auto-idempotency.ts`, or `completed-units.json`.

If a unit is complete, that should be visible through the durable project files and therefore through `deriveState()`.

#### 2. Verification moves into `finalizeUnit()`

For `execute-task`:

- run agent
- run verification
- if verification fails, produce retry context
- only record completion after verification passes

This deletes the current rollback shape where the system first behaves as if the unit is done and then tries to undo that belief.

#### 3. Side work is queued, never nested

Hooks, triage, quick tasks, reassessment, mechanical follow-up, and similar flows should emit queue entries. They should not call `newSession()` from inside post-unit callbacks.

#### 4. Worktree logic becomes a resolver, not a path mutation

Claude's path-resolver idea is the right one.

Do not keep mutating `s.basePath` / `s.originalBasePath` and forcing the rest of the system to compensate. The loop should ask a resolver for:

- work path
- lock path
- milestone path context

That contains worktree complexity at the boundary.

## 4. What Should Be Deleted First

These are the highest-value removals once the new loop exists:

- `completedKeySet`
- `.gsd/completed-units.json`
- `verifyExpectedArtifact()` in `auto-recovery.ts`
- most of `auto-idempotency.ts`
- most of `auto-stuck-detection.ts`
- inline dispatch paths in `auto-post-unit.ts`
- duplicated direct-dispatch/session-launch helpers

These modules or files are likely candidates for full deletion or absorption:

- `src/resources/extensions/gsd/auto-idempotency.ts`
- `src/resources/extensions/gsd/auto-stuck-detection.ts`
- `src/resources/extensions/gsd/auto-direct-dispatch.ts`
- `src/resources/extensions/gsd/auto-unit-closeout.ts`
- `src/resources/extensions/gsd/auto-constants.ts`

## 5. Migration Order

### Step 1. Introduce `RunState` without changing behavior

Dual-write a small runtime record beside the current lock/runtime files.

Goal:

- prove that active-unit state and queue state can be centralized
- do not yet delete old files

### Step 2. Convert `execute-task` to transactional finalization

This is the most important slice because it is where verification complexity is concentrated.

Goal:

- make `execute-task` completion impossible before verification passes
- represent retries as normal finalizer output, not special global state

### Step 3. Linearize the loop

Replace recursive redispatch from `handleAgentEnd()` with a serialized runner that waits for the unit to finish, finalizes it, and then explicitly chooses the next unit.

Goal:

- make reentrancy guards unnecessary
- remove gap/hang/watchdog code from the core control path

### Step 4. Queue post-unit side work

Convert hooks, triage, quick tasks, and similar follow-up actions into sidecar work items.

Goal:

- eliminate nested session creation during completion handling
- remove `pendingAgentEndRetry` class bugs

### Step 5. Delete false authorities

Once `deriveState()` plus `RunState` are sufficient:

- delete completion-key persistence
- delete artifact-guessing completion checks
- delete stuck/idempotency overlays that existed only to mediate between truth systems

### Step 6. Simplify worktree and doctor boundaries

After the loop is stable:

- move worktree handling behind a resolver
- demote doctor to startup/manual repair or explicit remediation

Doctor should not be required for normal unit-to-unit correctness.

### Step 7. Consider incremental graph optimization only if needed

Gemini's incremental graph idea is valid as a later optimization, but it should be the last step, not the first.

Only do this if profiling shows `deriveState()` is the real bottleneck after the loop has been simplified.

## 6. Final Recommendation

The best merged answer is not "build a smarter engine." It is "stop making a simple engine behave like a distributed system."

The minimum code that delivers maximum autonomous power is:

- `deriveState()` as workflow truth
- `resolveDispatch()` as pure next-unit selection
- one serialized runner
- one transactional unit finalizer
- one tiny durable runtime record
- one sidecar queue

Everything else should either be pushed to the boundary or deleted.

That is where the elegance is hiding: not in the recovery overlays, but in the parts of the codebase that already behave like pure functions over durable state.
