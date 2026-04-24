# External Process Waiting

GSD tasks can register a probe for an external process — a CI pipeline, SLURM HPC job, deployment, or any long-running operation — and the auto-loop polls it automatically until it completes or times out.

## Two-Phase Check Concept

External process waiting uses a two-phase check model:

1. **Phase 1 — `pollWhileCommand`** answers "is it still running?" The name says it: **poll while this command succeeds.**
   - **Exit 0** = condition holds, keep polling (still running)
   - **Non-zero exit** = condition no longer holds (done, stop polling)

2. **Phase 2 — `successCheck`** (optional) answers "did it succeed?" After `pollWhileCommand` signals done:
   - **Exit 0** = job succeeded
   - **Non-zero exit** = job failed

This separation exists because **job completion does not mean job success**. A SLURM job can exit the queue (done) but have failed internally. A CI pipeline can finish (done) but report test failures. The two-phase model lets you detect both conditions independently.

If `successCheck` is omitted, the task resumes as soon as `pollWhileCommand` signals done, with no success/failure distinction.

## Parameters Reference

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `pollWhileCommand` | Yes | — | Shell command to probe external process status. Exit 0 = keep polling (still running), non-zero = done. The name says it: poll WHILE this command succeeds. |
| `successCheck` | No | — | Second-phase shell command for deeper validation after `pollWhileCommand` signals done. Exit 0 = success, non-zero = failure. |
| `pollIntervalMs` | No | `30000` (30s) | How often the auto-loop probes, in milliseconds. |
| `timeoutMs` | No | `86400000` (24h) | Overall timeout in milliseconds. If exceeded, the configured `onTimeout` action fires. |
| `contextHint` | No | — | Human-readable description of what is being waited on (e.g., "SLURM job 12345 on cluster-gpu"). Carried forward into the task's resume context. |
| `onTimeout` | No | `manual-attention` | Action when timeout expires: `manual-attention` (pause for human review) or `resume-with-failure` (auto-resume with failure context). |

## SLURM HPC Example

Monitor a SLURM job and verify its exit code after completion:

```bash
# Phase 1: squeue returns exit 0 while the job is in the queue (still running).
# When the job finishes and leaves the queue, grep fails with exit 1 (done).
pollWhileCommand: 'squeue -j 12345 | grep -c 12345'

# Phase 2: sacct checks the job's actual exit code.
# Exit 0 if the job exited cleanly (0:0), non-zero otherwise.
successCheck: 'sacct -j 12345 --format=ExitCode --noheader | head -1 | grep -q "0:0"'
```

This works because `squeue` lists only active jobs. Once the job finishes, `grep -c 12345` finds no matches and exits non-zero, signaling "done" to Phase 1. Phase 2 then uses `sacct` to check whether the job actually succeeded.

## CI Example (GitHub Actions)

Monitor a GitHub Actions workflow run:

```bash
# Phase 1: test exits 0 while the status is NOT "completed" (still running).
# When the run completes, the test fails with exit 1 (done).
pollWhileCommand: 'test "$(gh run view 12345 --json status -q .status)" != "completed"'

# Phase 2: check the conclusion field for success.
successCheck: 'test "$(gh run view 12345 --json conclusion -q .conclusion)" = "success"'
```

The `test != "completed"` pattern matches the naming convention: **poll while** the condition holds (still running), stop when it no longer holds (done).

## Lifecycle

```text
Registration
    │
    ▼
Auto-loop polls at pollInterval
    │
    ├── pollWhileCommand exits 0 → still running, sleep and poll again
    │
    ├── pollWhileCommand exits non-zero → done
    │       │
    │       ├── No successCheck → task resumes with carry-forward context
    │       │
    │       ├── successCheck exits 0 → task resumes with "completed successfully" context
    │       │
    │       └── successCheck exits non-zero → task resumes with "JOB FAILED" context
    │
    ├── Probe fails (exec error/timeout) → increment failure count
    │       │
    │       ├── < 3 failures → continue polling
    │       │
    │       └── 3 failures → task transitions to manual-attention
    │
    └── Overall timeout exceeded
            │
            ├── onTimeout = "manual-attention" → task pauses for human review
            │
            └── onTimeout = "resume-with-failure" → task auto-resumes with timeout context
```

## Registration

Register an external wait using the `gsd_register_external_wait` tool during task execution:

```javascript
gsd_register_external_wait({
  milestoneId: "M006",
  sliceId: "S02",
  taskId: "T01",
  pollWhileCommand: 'squeue -j 12345 | grep -c 12345',
  successCheck: 'sacct -j 12345 --format=ExitCode --noheader | head -1 | grep -q "0:0"',
  pollIntervalMs: 60000,
  contextHint: "SLURM job 12345 on cluster-gpu"
})
```

The task transitions to `awaiting-external` status and the auto-loop takes over polling.

## See Also

- [Auto Mode](auto-mode.md) — general auto-loop documentation and dispatch mechanics
