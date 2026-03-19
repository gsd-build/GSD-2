# GSD-2 Auto-Mode Audit: The Minimum Machine

This audit explores the structural complexity of the GSD-2 auto-mode system with one driving question: **What is the MINIMUM code that delivers MAXIMUM autonomous power?**

---

## 1. Architecture Map: The Machine Today

The current system operates as an **event-driven reactive loop** rather than a linear process. It relies on the Pi agent's `agent_end` event to trigger the next step of the state machine.

### The Lifecycle:
1.  **Entry (`auto.ts`):** `/gsd auto` initializes the `AutoSession` (the single source of truth for mutable state) and calls `bootstrapAutoSession`.
2.  **Dispatch Cycle (`dispatchNextUnit`):**
    *   **State Reconstruction:** `deriveState` performs an O(N) scan of the `.gsd/` directory to build a `GSDState` object. It uses a Rust-based `nativeBatchParse` for performance.
    *   **Selection:** `resolveDispatch` evaluates declarative rules (in `auto-dispatch.ts`) to map the current `phase` to a `unitType` (e.g., `execute-task`, `plan-slice`) and a prompt.
    *   **Execution:** A fresh session is created via `cmdCtx.newSession()`, the model is selected via `auto-model-selection`, and the prompt is injected.
3.  **Observation (`auto-timers.ts`):** Watchdogs monitor the session for timeouts, "stuck" states (repeatedly dispatching the same unit), or idle gaps.
4.  **Completion (`handleAgentEnd`):**
    *   **Mechanical Sync:** `postUnitPreVerification` handles auto-commits, "Doctor" fixes to roadmap/plan files, and state rebuilds.
    *   **Verification Gate:** `runPostUnitVerification` executes shell commands (tests/lint). If they fail, it recursively triggers a "retry" dispatch with failure context.
    *   **Handoff:** `postUnitPostVerification` manages "Mechanical Completion" (skipping LLM sessions for summaries), post-unit hooks, and triage of captures.
    *   **Recursion:** The cycle restarts by calling `dispatchNextUnit`.

---

## 2. Root Causes: The 4 Structural Flaws

The complexity of the system is largely "accidental" — code that exists only to manage the fragility of the fragmented event loop.

### A. The "Async Recursion" Tax
Because the loop is driven by external events (`agent_end`) rather than a linear `while` loop, it suffers from race conditions where multiple events (or watchdogs) fire simultaneously.
*   **Evidence:** `s.dispatching`, `s.handlingAgentEnd`, `s.pendingAgentEndRetry`, and `s.skipDepth` are all guards created to prevent the machine from "double-looping" or "infinite-looping" during skip chains.
*   **Bloat:** ~15% of `auto.ts` is just "traffic control" for these events.

### B. O(N) "World Scanning"
The system has no persistent memory of the work graph. It re-derives everything from disk on every turn.
*   **Evidence:** `deriveState` is a 500-line function that must handle "phantom" states (units finished but not yet on disk) using `completedKeySet` and `recentlyEvictedKeys`.
*   **Bloat:** The system is constantly "rediscovering" its own position.

### C. Bolted-on Verification
Verification (testing) is treated as an interruption to the loop rather than a core part of a Task's execution.
*   **Evidence:** When a test fails, the system has to "fake" a new unit dispatch with a `PendingVerificationRetry` object. This splits the logic of a single task across two separate sessions.
*   **Bloat:** `auto-verification.ts` and `verification-gate.ts` have to pass complex failure context back through the global state to the next prompt.

### D. Leakage of "Mechanical" Logic
The "Doctor" and "Mechanical Completion" systems exist because the LLM is unreliable at updating the `.gsd/` files correctly. Instead of making the file updates deterministic, we've built a "janitor" system that runs after every turn.
*   **Evidence:** `postUnitPreVerification` and `runGSDDoctor` run on every `agent_end` to fix checkbox errors and roadmap inconsistencies.

---

## 3. The Minimal Machine: The Platonic Ideal

To reach maximum power with minimum code, the system should shift from a **reactive dispatcher** to a **linear executor**.

### I. The Linear Runner
Replace the fragmented `handleAgentEnd` with a single `async` execution loop.
```typescript
while (s.active) {
  const unit = await engine.next(); // Returns a Unit object (Task, Plan, Research)
  if (!unit) break;

  const result = await unit.run();   // Handles session + internal retries + verification
  if (result.status === 'failed') {
    await s.pause("Verification exhausted");
    break;
  }
  await engine.sync(result.effects); // Incremental graph update, not full disk scan
}
```
*   **Impact:** Eliminates all reentrancy guards, gap watchdogs, and hang guards.

### II. Unit Encapsulation
Move logic out of the orchestrator and into a `Unit` interface. A `TaskUnit` should own its own verification and retry logic.
*   **Minimal Machine:** `TaskUnit.run()` handles the agent session, runs its own tests, and retries internally up to `maxRetries` before returning. The orchestrator doesn't need to know about `failureContext`.

### III. Incremental Work Graph
Instead of scanning the disk, maintain a **Work Graph** in memory.
*   **Minimal Machine:** Unit completion emits an `Effect` (e.g., `TaskDone(T01)`). The Graph updates only that node and its dependents. Disk becomes a persistence layer (the "save file"), not the primary input for every turn.

---

## 4. Migration Path

We can transition without a total rewrite by "linearizing" the existing components:

1.  **Phase 1: Linearize the Entry Point.** Wrap `dispatchNextUnit` in a function that returns a `Promise` which only resolves when the agent turn is actually "complete" (after verification).
2.  **Phase 2: Extract the "Unit" Logic.** Move the prompt building and verification logic from `auto-dispatch.ts` and `auto-verification.ts` into discrete `Unit` classes.
3.  **Phase 3: The Graph Transition.** Update `deriveState` to be an incremental updater of an in-memory `WorkGraph` rather than a from-scratch parser.
4.  **Phase 4: Prune.** Delete the `dispatching` guards, `gapWatchdog`, and `pendingAgentEndRetry` logic as they become unreachable in a linear loop.

**Conclusion:** The current complexity is the cost of **reactivity**. Moving to **linearity** reduces the state-space of the auto-mode loop by an order of magnitude, making it both simpler and more powerful.
