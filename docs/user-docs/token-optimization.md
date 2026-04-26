# Token Optimization

*Introduced in v2.17.0*

GSD 2.17 introduces a coordinated token optimization system that can reduce token usage by 40-60% without sacrificing output quality for most workloads. The system has three pillars: **token profiles**, **context compression**, and **complexity-based task routing**.

## Token Profiles

A token profile is a single preference that coordinates model tier selection, phase skipping, and context compression level. Set it in your preferences:

```yaml
---
version: 1
token_profile: balanced
---
```

Three profiles are available:

### `budget` — Maximum Savings (40-60% reduction)

Optimized for cost-sensitive workflows. Uses cheaper model tiers, skips optional phases, and compresses dispatch context to the minimum needed.

| Dimension | Setting |
|-----------|---------|
| Planning model tier | Standard |
| Research model tier | Light |
| Execution model tier | Standard |
| Simple task model tier | Light |
| Completion model tier | Light |
| Subagent model tier | Light |
| Milestone research | **Skipped** |
| Slice research | **Skipped** |
| Roadmap reassessment | **Skipped** |
| Context inline level | **Minimal** — drops decisions, requirements, extra templates |

Best for: prototyping, small projects, well-understood codebases, cost-conscious iteration.

### `balanced` — Smart Defaults (default)

The default profile. Uses standard-tier defaults for core work, skips lower-value orchestration phases, and uses standard context compression.

| Dimension | Setting |
|-----------|---------|
| Planning model tier | Standard |
| Research model tier | Standard |
| Execution model tier | Standard |
| Simple task model tier | Light |
| Completion model tier | Light |
| Subagent model tier | Light |
| Milestone research | **Skipped** |
| Slice research | **Skipped** |
| Roadmap reassessment | **Skipped** |
| Context inline level | **Standard** — includes key context, drops low-signal extras |

Best for: most projects, day-to-day development.

### `quality` — Full Context (no compression)

Uses stronger tier defaults for planning and full context inlining for dispatched prompts.

| Dimension | Setting |
|-----------|---------|
| Planning model tier | Heavy |
| Research model tier | Standard |
| Execution model tier | Standard |
| Simple task model tier | Light |
| Completion model tier | Light |
| Subagent model tier | Standard |
| Milestone research | **Skipped** |
| Slice research | **Skipped** |
| Roadmap reassessment | **Skipped** |
| Context inline level | **Full** — everything inlined |

Best for: complex architectures, critical production work, and workflows where you want full prompt context while retaining the simplified phase pipeline. Override `phases` if you want to force skipped research or reassessment phases back on.

Profile model settings are provider-agnostic. Each profile declares the intended capability tier for each phase, then GSD resolves that tier to an available model from your configured providers at runtime. For example, a light tier may resolve to Haiku, `gpt-4o-mini`, Gemini Flash, or another configured light model depending on what is available. If the model registry is unavailable during early startup, GSD falls back to canonical Anthropic IDs until concrete providers can be resolved.

## Context Compression

Each token profile maps to an **inline level** that controls how much context is pre-loaded into dispatch prompts:

| Profile | Inline Level | What's Included |
|---------|-------------|-----------------|
| `budget` | `minimal` | Task plan, essential prior summaries (truncated). Drops decisions register, requirements, UAT template, secrets manifest. |
| `balanced` | `standard` | Task plan, prior summaries, slice plan, roadmap excerpt. Drops some supplementary templates. |
| `quality` | `full` | Everything — all plans, summaries, decisions, requirements, templates, and root files. |

### How Compression Works

Dispatch prompt builders accept an `inlineLevel` parameter. At each level, specific artifacts are gated:

**Minimal level reductions:**
- `buildExecuteTaskPrompt` — drops the decisions template, truncates prior summaries to the most recent one
- `buildPlanMilestonePrompt` — drops `PROJECT.md`, `REQUIREMENTS.md`, decisions, and supplementary templates like `secrets-manifest`
- `buildCompleteSlicePrompt` — drops requirements and UAT template inlining
- `buildCompleteMilestonePrompt` — drops root GSD file inlining
- `buildReassessRoadmapPrompt` — drops project, requirements, and decisions files

These are cumulative — `standard` drops a subset, `minimal` drops more. The `full` level preserves all context (the pre-2.17 behavior).

### Overriding Inline Level

The inline level is derived from your `token_profile`. To control phases independently of the profile, use the `phases` preference:

```yaml
---
version: 1
token_profile: budget
phases:
  skip_research: false    # override: run research even on budget
---
```

Explicit `phases` settings always override the profile defaults.

## Complexity-Based Task Routing

GSD classifies each task by complexity and routes it to an appropriate model tier when dynamic routing is enabled. Simple documentation fixes use cheaper models while complex architectural work gets the reasoning power it needs.

> **Prerequisite:** Dynamic routing requires explicit `models` in your preferences. Without a `models` section, routing is skipped and the session's launch model is used for all phases. Token profiles set `models` automatically.

> **Ceiling behavior:** When dynamic routing is active, the model configured for each phase acts as a **ceiling**, not a fixed assignment. The router may downgrade to a cheaper model for simpler tasks but never upgrades beyond the configured model.

### How Classification Works

Tasks are classified by analyzing the task plan:

| Signal | Simple | Standard | Complex |
|--------|--------|----------|---------|
| Step count | ≤ 3 | 4-7 | ≥ 8 |
| File count | ≤ 3 | 4-7 | ≥ 8 |
| Description length | < 500 chars | 500-2000 | > 2000 chars |
| Code blocks | — | — | ≥ 5 |
| Signal words | None | Any present | — |

**Signal words** that prevent simple classification: `research`, `investigate`, `refactor`, `migrate`, `integrate`, `complex`, `architect`, `redesign`, `security`, `performance`, `concurrent`, `parallel`, `distributed`, `backward compat`, `migration`, `architecture`, `concurrency`, `compatibility`.

Empty or malformed plans default to `standard` (conservative).

### Unit Type Defaults

Non-task units have built-in tier assignments:

| Unit Type | Default Tier |
|-----------|-------------|
| `complete-slice`, `run-uat` | Light |
| `research-*`, `plan-*`, `execute-task`, `complete-milestone` | Standard |
| `replan-slice`, `reassess-roadmap` | Heavy |
| `hook/*` | Light |

### Model Routing

Each tier maps to a model configuration:

| Tier | Model Phase Key | Typical Resolution |
|------|----------------|--------------------|
| Light | `completion` / `execution_simple` | Cheapest available light-tier model |
| Standard | `execution` / `planning` | Available standard-tier model |
| Heavy | `planning` / escalation paths | Available heavy-tier model |

Simple tasks use the `execution_simple` model key when configured. Token profiles set this automatically to a light-tier model that is resolved from your available providers.

### Budget Pressure

When approaching your budget ceiling, the classifier automatically downgrades tiers:

| Budget Used | Effect |
|------------|--------|
| < 50% | No adjustment |
| 50-75% | Standard → Light |
| 75-90% | Standard → Light |
| > 90% | Everything except Heavy → Light; Heavy → Standard |

This graduated approach preserves model quality for the most complex work while progressively reducing cost as the ceiling approaches.

## Adaptive Learning (Routing History)

GSD tracks the success and failure of each tier assignment over time and adjusts future classifications accordingly. This is opt-in — it happens automatically and persists in `.gsd/routing-history.json`.

### How It Works

1. After each unit completes, the outcome (success/failure) is recorded against the unit type and tier used
2. Outcomes are tracked per-pattern (e.g., `execute-task`, `execute-task:docs`) with a rolling window of the last 50 entries
3. If a tier's failure rate exceeds 20% for a given pattern, future classifications for that pattern are bumped up one tier
4. The system also accepts tag-specific patterns (e.g., `execute-task:test` vs `execute-task:frontend`) for more granular routing

### User Feedback

Use `/gsd rate` to submit feedback on the last completed unit's model tier:

```
/gsd rate over    # model was overpowered — encourage cheaper next time
/gsd rate ok      # model was appropriate — no adjustment
/gsd rate under   # model was too weak — encourage stronger next time
```

Feedback signals are weighted 2× compared to automatic outcomes. Requires dynamic routing to be active (the last unit must have tier data).

### Data Management

```bash
# Routing history is stored per-project
.gsd/routing-history.json

# Clear history to reset adaptive learning
# (happens via the routing-history module API)
```

The feedback array is capped at 200 entries. Per-pattern outcome counts use a rolling window of 50 to prevent stale data from dominating.

## Configuration Examples

### Cost-Optimized Setup

```yaml
---
version: 1
token_profile: budget
budget_ceiling: 25.00
models:
  execution_simple: claude-haiku-4-5-20250414
---
```

### Balanced with Custom Models

```yaml
---
version: 1
token_profile: balanced
models:
  planning:
    model: claude-opus-4-6
    fallbacks:
      - openrouter/z-ai/glm-5
  execution: claude-sonnet-4-6
---
```

### Full Quality for Critical Work

```yaml
---
version: 1
token_profile: quality
models:
  planning: claude-opus-4-6
  execution: claude-opus-4-6
---
```

### Per-Phase Overrides

The `token_profile` sets defaults, but explicit preferences always win:

```yaml
---
version: 1
token_profile: budget
phases:
  skip_research: false     # override: keep milestone research
models:
  planning: claude-opus-4-6  # override: use Opus for planning despite budget profile
---
```

## How the Pieces Fit Together

```
PREFERENCES.md
  └─ token_profile: balanced
       ├─ resolveProfileDefaults() → model defaults + phase skip defaults
       ├─ resolveInlineLevel() → standard
       │    └─ prompt builders gate context inclusion by level
       ├─ classifyUnitComplexity() → routes to execution/execution_simple model
       │    ├─ task plan analysis (steps, files, signals)
       │    ├─ unit type defaults
       │    ├─ budget pressure adjustment
       │    ├─ adaptive learning from routing-history.json
       │    └─ capability scoring (when capability_routing: true)
       │         └─ 7-dimension model profiles × task requirement vectors
       └─ context_management
            ├─ observation masking (before_provider_request hook)
            ├─ tool result truncation (tool_result_max_chars)
            └─ phase handoff anchors (injected into prompt builders)
```

The profile is resolved once and flows through the entire dispatch pipeline. Explicit preferences override profile defaults at every layer.

## Observation Masking

*Introduced in v2.59.0*

During auto-mode sessions, tool results accumulate in the conversation history and consume context window space. Observation masking replaces tool result content older than N user turns with a lightweight placeholder before each LLM call. This reduces token usage with zero LLM overhead — no summarization calls, no latency.

Masking is enabled by default during auto-mode. Configure via preferences:

```yaml
context_management:
  observation_masking: true     # default: true (set false to disable)
  observation_mask_turns: 8     # keep results from last 8 user turns (range: 1-50)
  tool_result_max_chars: 800    # truncate individual tool results beyond this length
```

### How It Works

1. Before each provider request, the `before_provider_request` hook inspects the messages array
2. Tool results (`toolResult`, `bashExecution`) older than the configured turn threshold are replaced with `[result masked — within summarized history]`
3. Recent tool results (within the keep window) are preserved in full
4. All assistant and user messages are always preserved — only tool result content is masked

This pairs with the existing compaction system: masking reduces context pressure between compactions, and compaction handles the full context reset when the window fills.

### Tool Result Truncation

Individual tool results that exceed `tool_result_max_chars` (default: 800) are truncated with a `…[truncated]` marker. This prevents a single large tool output from dominating the context window.

## Phase Handoff Anchors

*Introduced in v2.59.0*

When auto-mode transitions between phases (research → planning → execution), structured JSON anchors are written to `.gsd/milestones/<mid>/anchors/<phase>.json`. Downstream prompt builders inject these anchors so the next phase inherits intent, decisions, blockers, and next steps without re-inferring from artifact files.

This reduces context drift — the 65% of enterprise agent failures caused by agents losing track of prior decisions across phase boundaries.

Anchors are written automatically after successful completion of `research-milestone`, `research-slice`, `plan-milestone`, and `plan-slice` units. No configuration needed.

## Prompt Compression

*Introduced in v2.29.0*

GSD can apply deterministic prompt compression before falling back to section-boundary truncation. This preserves more information when context exceeds the budget.

### Compression Strategy

Set via preferences:

```yaml
---
version: 1
compression_strategy: compress
---
```

Two strategies are available:

| Strategy | Behavior | Default For |
|----------|----------|------------|
| `truncate` | Drop entire sections at boundaries (pre-v2.29 behavior) | `quality` profile |
| `compress` | Apply heuristic text compression first, then truncate if still over budget | `budget` and `balanced` profiles |

Compression removes redundant whitespace, abbreviates verbose phrases, deduplicates repeated content, and removes low-information boilerplate — all deterministically with no LLM calls.

### Context Selection

Controls how files are inlined into prompts:

```yaml
---
version: 1
context_selection: smart
---
```

| Mode | Behavior | Default For |
|------|----------|------------|
| `full` | Inline entire files | `balanced` and `quality` profiles |
| `smart` | Use TF-IDF semantic chunking for large files (>3KB), including only relevant portions | `budget` profile |

### Structured Data Compression

At `budget` and `balanced` inline levels, decisions and requirements are formatted in a compact notation that saves 30-50% tokens compared to full markdown tables.

### Summary Distillation

When a slice has 3+ dependency summaries and the total exceeds the summary budget, GSD extracts essential structured data (provides, requires, key_files, key_decisions) and drops verbose prose sections before falling back to section-boundary truncation.

### Cache Hit Rate Tracking

The metrics ledger now tracks `cacheHitRate` per unit (percentage of input tokens served from cache) and provides `aggregateCacheHitRate()` for session-wide cache performance.
