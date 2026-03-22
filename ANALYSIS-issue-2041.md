# Analysis: Issue #2041 — Replace Markdown-Based State Machine with Tool-Driven Database Architecture

## Executive Summary

Issue #2041 proposes replacing GSD-2's markdown-file-based state machine with a tool-driven SQLite architecture. After a full codebase analysis, **the diagnosis is correct and the proposed direction is sound**. The problem is larger than initially scoped (~10K lines of reconciliation-adjacent code vs. the claimed ~5,900), and the migration needs a careful incremental approach.

---

## Problem Quantification

### Five Redundant State Systems

| System | Location | Purpose |
|--------|----------|---------|
| In-memory `completedUnits[]` | Runtime | Track completions this session |
| `completed-units.json` | Disk | Persist completions across crashes |
| Markdown checkboxes | `.gsd/*-PLAN.md`, `*-ROADMAP.md` | Human-readable state |
| Summary file existence | `.gsd/*/SUMMARY.md` | Proof of completion |
| Runtime record JSON | Various `.json` files | Session metadata |

### Lines of Code Dedicated to Reconciliation

| Category | Files | Lines |
|----------|-------|-------|
| State derivation (`state.ts`) | 1 | 868 |
| Doctor system (`doctor*.ts`) | 4 | 2,969 |
| Recovery code (`*-recovery.ts`, `crash-recovery.ts`) | 3 | 1,177 |
| Forensics (`forensics.ts`, `session-forensics.ts`) | 2 | 1,172 |
| File parsing/mutation (`files.ts`, `roadmap-*.ts`) | 3 | ~1,500 |
| Verification & closeout | 3 | 915 |
| Worktree state sync | 2 | 1,506 |
| **Total** | **~18** | **~10,107** |

### Blast Radius in the Codebase

- **82 files** reference `completedUnits` or reconciliation patterns (430 occurrences)
- **95 files** touch checkbox/completion state (748 occurrences)
- Hundreds of test fixtures create `.gsd/` markdown structures with state assumptions

### LLM Token Waste

- Bookkeeping instructions consume ~5K-10K chars per task dispatch
- Failed checkbox edits trigger retry loops at 20K-50K tokens per retry
- No max retry cap on artifact verification — potential infinite loop
- Structured tools exist (`gsd_save_decision`, `gsd_save_summary`) but are NOT referenced in default prompts
- Estimated 15-25% token overhead per auto-mode session from bookkeeping

---

## Proposed Long-Term Architecture

### Three-Layer Design

```
┌─────────────────────────────────────────────┐
│           Layer 1: Tool API                  │
│  (What the LLM sees and calls)              │
│                                              │
│  complete_task(taskId, summary, evidence)    │
│  complete_slice(sliceId, summary, uat)       │
│  complete_milestone(milestoneId, summary)    │
│  save_decision(context, decision, rationale) │
│  report_blocker(taskId, description)         │
│  update_requirement(reqId, status, notes)    │
│                                              │
│  → LLM NEVER touches .gsd/ files directly   │
└──────────────────┬──────────────────────────┘
                   │ Structured params
┌──────────────────▼──────────────────────────┐
│           Layer 2: State Engine              │
│  (TypeScript owns ALL transitions)           │
│                                              │
│  SQLite: Single source of truth              │
│  - milestones, slices, tasks tables          │
│  - verification_evidence table               │
│  - decisions, requirements tables            │
│                                              │
│  Atomic transitions via SQL transactions     │
│  deriveState() = SELECT query (<1ms)         │
│  Event log for audit trail                   │
└──────────────────┬──────────────────────────┘
                   │ Render on change
┌──────────────────▼──────────────────────────┐
│           Layer 3: Markdown Views            │
│  (Human-readable, regenerable, optional)     │
│                                              │
│  .gsd/ files become READ-ONLY views          │
│  Rendered from DB after every state change   │
│  Deletion/corruption = regenerate from DB    │
│  Git-friendly diffs for PR review            │
└─────────────────────────────────────────────┘
```

### Core Principle

> "The LLM produces artifacts via tool calls. TypeScript owns all state transitions. Markdown files become rendered views, not sources of truth."

### Key Design Decisions

1. **Tool calls are the ONLY way state changes.** No prompt instructs the LLM to edit `.gsd/` files. Tool implementations validate inputs, write to SQLite in a transaction, and render markdown as a side effect.

2. **Doctor becomes a consistency assertion, not a fixer.** It verifies DB ↔ markdown agreement. Disagreement → re-render from DB. No more 800 lines of fix logic.

3. **Retry loops get hard caps.** `complete_task()` succeeds or fails clearly. Max 3 retries, then escalate. No "did the checkbox stick?" ambiguity.

4. **Event log replaces forensics.** Every state transition logged with timestamp, actor, and previous state. `session-forensics.ts` becomes a log query.

---

## Migration Strategy (Incremental, Not Big-Bang)

### Phase 0: Foundation (Non-Breaking)
- Add `complete_task()`, `complete_slice()`, `complete_milestone()` tools
- Tools write to both SQLite AND markdown (dual-write)
- Existing prompts unchanged — both paths work
- Doctor validates both systems agree

### Phase 1: Prompt Migration
- Update prompt templates to prefer tool calls over manual edits
- `execute-task.md`: Replace "Mark T01 done in PLAN.md" with "Call complete_task()"
- Doctor tracks which path was used (tool vs manual edit) for telemetry
- Run in production, measure LLM compliance rates

### Phase 2: Tool Calls Mandatory
- Prompts no longer mention manual checkbox editing
- Manual `.gsd/` edits by LLM trigger warnings in doctor
- SQLite becomes authoritative; markdown rendered from DB
- `gsd migrate` command for existing projects

### Phase 3: Remove Parsing Code
- Delete markdown → state parsing (`files.ts` checkbox logic, `roadmap-slices.ts` parsers)
- `deriveState()` becomes SQL query
- Doctor fix logic removed (replaced by `regenerateViews()`)

### Phase 4: Dead Code Cleanup
- Remove reconciliation code, forensics for state drift
- Remove `completed-units.json` persistence
- Remove retry logic for checkbox failures
- Net deletion: ~4,000-6,000 lines

---

## Code Impact Estimate

### Deletions (~4,000-6,000 lines)

| Code | Lines | Replacement |
|------|-------|-------------|
| Doctor fix logic | ~800 | `regenerateViews()` |
| Health scoring/escalation | ~430 | DB constraint violations |
| Markdown checkbox parsers | ~300 | SQL queries |
| Checkbox mutation functions | ~200 | `UPDATE tasks SET status='done'` |
| Stuck detection for state drift | ~75 | Impossible by construction |
| Placeholder generation | ~90 | Not needed |
| State derivation (partial) | ~400 | SQL query |
| Reconciliation in auto-recovery | ~500 | Transaction rollback |
| Forensics for state inconsistency | ~600 | Event log queries |
| Prompt bookkeeping instructions | ~1,000 | Tool schema |

### Additions (~1,500-2,000 lines)

| New Code | Lines |
|----------|-------|
| SQLite schema + migrations | ~200 |
| Tool implementations (6 tools) | ~600 |
| Markdown renderer (DB → .md) | ~400 |
| Migration command (`gsd migrate`) | ~300 |
| Event log / audit trail | ~200 |

### Net: -3,000 to -4,000 lines with dramatically improved reliability

---

## Priority Recommendation

**Start with `complete_task()`.** This single tool eliminates:
- The most common failure mode (checkbox not toggled)
- The most expensive recovery path (artifact verification retry loops with no cap)
- The most token-wasteful pattern (LLM reading PLAN.md to find one checkbox)

This one tool, deployed in Phase 0 dual-write mode, can prove the architecture before committing to the full migration.

---

## Success Criteria (from ADR, validated)

1. Zero doctor fix runs in normal operation ✓ (achievable by Phase 3)
2. No "non-fatal" catch blocks for state inconsistency ✓ (achievable by Phase 4)
3. Auto-mode never stops for bookkeeping failures ✓ (achievable by Phase 2)
4. Net code reduction of 2,000+ lines ✓ (estimated 3,000-4,000)
5. `deriveState()` executes in <1ms ✓ (SQL query vs 868-line parser)
