# GSD-2 Auto-Mode: Synthesis of Deep Audits

This document synthesizes the findings from three independent deep audits (Gemini, Claude, and Codex) to define the path toward the "Minimal Machine."

---

## 1. The Core Diagnosis: Fragmented Reactivity

The current system is not a loop; it is a **recursive graph of callbacks** compensating for the lack of a serialized control flow.

### Consensus Root Causes:
1.  **Async Recursion Tax:** Because `agent_end` events trigger the next turn, the system must use "connective tissue" (reentrancy guards, gap watchdogs, hang guards) to prevent stalls or double-dispatches.
2.  **Dual Truth Systems:** `deriveState()` (disk-based) and the dispatch loop (memory/artifact-based) frequently disagree on whether a unit is "done." This necessitates complex idempotency and stuck-detection logic.
3.  **Post-Unit "Shadow" Dispatch:** `postUnitPostVerification` can dispatch hooks, triage, and quick-tasks inline, creating nested sessions that break the primary event loop.
4.  **Bolted-on Verification:** Verification is a post-pass that must "unwind" state and rollback completion files if it fails, rather than being a gate to completion itself.

---

## 2. The Minimal Machine: A Three-Layer Model

The target architecture collapses ~9,800 lines into a robust, linearized runner.

### Layer 1: The Serialized Loop
Replace the recursive `handleAgentEnd` with a simple `while` loop.
- **Role:** Advance the machine exactly one unit at a time.
- **Mechanism:** `deriveState()` -> `resolveDispatch()` -> `runUnit()` -> `postUnit()`.
- **Eliminations:** Reentrancy guards, gap watchdogs, hang guards, and skip-depth limits.

### Layer 2: `deriveState()` as the Single Source of Truth
Eliminate `completedKeySet` and `verifyExpectedArtifact()`.
- **Logic:** If `deriveState()` returns the same phase twice, it’s a "stuck" condition. If it returns a new phase, the previous work is implicitly "done."
- **Eliminations:** `auto-idempotency.ts`, `auto-stuck-detection.ts`, and `completed-units.json`.

### Layer 3: Transactional Unit Finalization
Move verification and side-effects (commits, doctor fixes) into a `Unit.finalize()` method.
- **Logic:** A unit is not "complete" until it passes verification. Failure is a normal branch of execution (retry), not an exception path requiring rollback.
- **Eliminations:** Complex rollback logic and post-verification unwind code.

---

## 3. Structural Impact (Target Reduction)

| Category | Current State | Minimal Machine |
| :--- | :--- | :--- |
| **Control Flow** | Recursive Events | Linear `while` loop |
| **Completion** | Inferred (Artifacts) | Transactional (State Change) |
| **Verification** | Post-Pass Rollback | Pre-Completion Gate |
| **Follow-up Work** | Nested Dispatch | Sequential Work Queue |
| **File Count** | 22 files | ~12 files |
| **Line Count** | ~9,800 lines | ~6,500 lines (-33%) |

---

## 4. Execution Roadmap

### Phase 1: Linearization (High Value / High Stability)
Convert `handleAgentEnd` to resolve a promise that the main loop awaits.
- **Goal:** Stop the "nested dispatch" of hooks, triage, and quick-tasks. Move them to a sequential queue.
- **Impact:** Eliminates the #1 category of "stalled loop" bugs.

### Phase 2: Unified Truth (Stability)
Delete the "Artifact Expectation" heuristics.
- **Goal:** Make `deriveState()` the sole authority.
- **Impact:** Eliminates "drift" between what the LLM did and what the system thinks is next.

### Phase 3: Transactional Execution (Integrity)
Encapsulate verification inside the `Unit` runner.
- **Goal:** A unit "ends" only after it passes tests or exhausts retries.
- **Impact:** Simplifies the state machine by removing "retry" as a separate unit type.

---

## Closing Verdict
The elegance of GSD-2 is currently buried under a layer of "janitor" code. By moving from **Reactive Fragmentation** to **Linear Serialization**, we can delete roughly 3,000 lines of code while making the system fundamentally more reliable and easier to extend.
