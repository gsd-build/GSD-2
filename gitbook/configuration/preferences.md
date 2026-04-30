# Preferences

GSD preferences live in YAML frontmatter markdown files. You can configure them globally or per-project.

## Managing Preferences

```
/gsd prefs              # open the global preferences wizard
/gsd prefs project      # open the project preferences wizard
/gsd prefs status       # show current values and where they come from
```

## Preference Files

| Scope | Path | Applies To |
|-------|------|-----------|
| Global | `~/.gsd/PREFERENCES.md` | All projects |
| Project | `.gsd/PREFERENCES.md` | Current project only |

**How they merge:**
- **Scalar fields** (`budget_ceiling`, `token_profile`): project wins if defined
- **Array fields** (`always_use_skills`, etc.): concatenated (global first, then project)
- **Object fields** (`models`, `git`, `auto_supervisor`): shallow-merged, project overrides per-key

## Quick Example

```yaml
---
version: 1

# Model selection
models:
  research: claude-sonnet-4-6
  planning: claude-opus-4-7
  execution: claude-sonnet-4-6
  completion: claude-sonnet-4-6

# Token optimization
token_profile: balanced

# Project discovery
planning_depth: deep

# Budget
budget_ceiling: 25.00
budget_enforcement: pause

# Supervision
auto_supervisor:
  soft_timeout_minutes: 15
  hard_timeout_minutes: 25

# Git
git:
  auto_push: true
  merge_strategy: squash
  isolation: none
  collapse_cadence: milestone   # or "slice" — see Git & Worktrees docs
  # milestone_resquash applies only when collapse_cadence: "slice"
  # milestone_resquash: true    # collapse slice commits into one at milestone end

# Verification
verification_commands:
  - npm run lint
  - npm run test

# Notifications
notifications:
  on_milestone: true
  on_attention: true
---
```

## All Settings

### `models`

Per-phase model selection. See [Choosing a Model](../getting-started/choosing-a-model.md).

```yaml
models:
  research: claude-sonnet-4-6
  planning:
    model: claude-opus-4-7
    fallbacks:
      - openrouter/z-ai/glm-5
  execution: claude-sonnet-4-6
  execution_simple: claude-haiku-4-5
  completion: claude-sonnet-4-6
  subagent: claude-sonnet-4-6
```

### `token_profile`

Coordinates model selection, phase skipping, and context compression. Values: `budget`, `balanced` (default), `quality`. See [Token Optimization](../features/token-optimization.md).

### `planning_depth`

Controls how much discovery runs before milestone-level planning.

```yaml
planning_depth: deep
```

| Value | Behavior |
|-------|----------|
| `light` | Default. Uses the normal milestone discussion flow. |
| `deep` | Runs workflow preferences, `.gsd/PROJECT.md`, `.gsd/REQUIREMENTS.md`, a research decision, and optional project research before milestone planning. |

Enable deep mode with `/gsd new-project --deep`, `/gsd new-milestone --deep`, or by adding the setting to `.gsd/PREFERENCES.md`. The research decision is recorded in `.gsd/runtime/research-decision.json`; choosing research writes `.gsd/research/STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, and `PITFALLS.md`.

### `budget_ceiling`

Maximum USD to spend during auto mode:

```yaml
budget_ceiling: 50.00
```

### `budget_enforcement`

What happens when the ceiling is reached:

| Value | Behavior |
|-------|----------|
| `warn` | Log a warning, continue |
| `pause` | Pause auto mode (default) |
| `halt` | Stop auto mode entirely |

### `auto_supervisor`

Timeout thresholds for auto mode:

```yaml
auto_supervisor:
  soft_timeout_minutes: 20    # warn AI to wrap up
  idle_timeout_minutes: 10    # detect stalls
  hard_timeout_minutes: 30    # pause auto mode
```

### `min_request_interval_ms`

Minimum milliseconds between auto-mode LLM request dispatches. Use this to proactively slow auto-mode on rate-limited providers and reduce 429 errors. Set to `0` to disable.

```yaml
min_request_interval_ms: 1000   # wait at least 1 second between LLM requests
```

Default: `0` (disabled)

### `verification_commands`

Shell commands that run after every task execution:

```yaml
verification_commands:
  - npm run lint
  - npm run test
verification_auto_fix: true       # auto-retry on failure (default)
verification_max_retries: 2       # max attempts (default: 2)
```

### `phases`

Fine-grained control over which phases run:

```yaml
phases:
  skip_research: false
  skip_reassess: false
  skip_slice_research: true
  reassess_after_slice: true
  require_slice_discussion: false
```

### `reactive_execution`

Automatic parallel task dispatch inside a slice. Reactive execution is enabled by default and only dispatches when task-plan IO annotations produce a non-ambiguous graph with enough ready, non-conflicting tasks.

```yaml
reactive_execution:
  enabled: false    # opt out
```

When omitted, GSD uses the default-on threshold of three ready tasks. Set `enabled: true` explicitly to use the lower two-ready-task threshold. Optional fields: `max_parallel` (default `2`, range `1`-`8`), `isolation_mode: same-tree`, and `subagent_model`.

### `skill_discovery`

| Value | Behavior |
|-------|----------|
| `auto` | Skills found and applied automatically |
| `suggest` | Skills identified but not auto-applied (default) |
| `off` | Skill discovery disabled |

### `dynamic_routing`

Automatic model selection by task complexity. See [Dynamic Model Routing](../features/dynamic-model-routing.md).

```yaml
dynamic_routing:
  enabled: true
  escalate_on_failure: true
  budget_pressure: true
```

### `git`

Git behavior. See [Git & Worktrees](git-settings.md).

```yaml
git:
  auto_push: false
  merge_strategy: squash
  isolation: none
  commit_docs: true
  auto_pr: false
```

Set `isolation: worktree` when you need milestone file isolation. Worktree mode requires a committed `HEAD`; in a zero-commit repo, GSD temporarily behaves as `none` until the first commit exists.

### `notifications`

See [Notifications](notifications.md).

```yaml
notifications:
  enabled: true
  on_complete: true
  on_error: true
  on_milestone: true
  on_attention: true
```

### `remote_questions`

Route questions to Slack, Discord, or Telegram. See [Remote Questions](../features/remote-questions.md).

```yaml
remote_questions:
  channel: discord
  channel_id: "1234567890123456789"
  timeout_minutes: 5
```

### `parallel`

Run multiple milestones simultaneously. See [Parallel Orchestration](../features/parallel.md).

```yaml
parallel:
  enabled: false
  max_workers: 2
  budget_ceiling: 50.00
```

### `custom_instructions`

Durable instructions appended to every session:

```yaml
custom_instructions:
  - "Always use TypeScript strict mode"
  - "Prefer functional patterns over classes"
```

For project-specific patterns, use `.gsd/KNOWLEDGE.md` instead — it's injected into every agent prompt automatically.

### `context_pause_threshold`

Context window usage percentage at which auto mode pauses:

```yaml
context_pause_threshold: 80   # pause at 80%
```

### `show_token_cost`

Show per-prompt and cumulative session token cost in the footer:

```yaml
show_token_cost: true
```
