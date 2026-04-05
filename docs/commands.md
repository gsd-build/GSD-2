# Commands Reference

## Session Commands

| Command | Description |
|---------|-------------|
| `/gsd` | Step mode — execute one unit at a time, pause between each |
| `/gsd next` | Explicit step mode (same as `/gsd`) |
| `/gsd auto` | Autonomous mode — research, plan, execute, commit, repeat |
| `/gsd quick` | Execute a quick task with GSD guarantees (atomic commits, state tracking) without full planning overhead |
| `/gsd stop` | Stop auto mode gracefully |
| `/gsd pause` | Pause auto-mode (preserves state, `/gsd auto` to resume) |
| `/gsd steer` | Hard-steer plan documents during execution |
| `/gsd discuss` | Discuss architecture and decisions (works alongside auto mode) |
| `/gsd status` | Progress dashboard |
| `/gsd widget` | Cycle dashboard widget: full / small / min / off |
| `/gsd queue` | Queue and reorder future milestones (safe during auto mode) |
| `/gsd capture` | Fire-and-forget thought capture (works during auto mode) |
| `/gsd triage` | Manually trigger triage of pending captures |
| `/gsd test` | Interactive manual testing — walk through checks, record pass/fail/notes |
| `/gsd dispatch` | Dispatch a specific phase directly (research, plan, execute, complete, reassess, uat, replan) |
| `/gsd history` | View execution history (supports `--cost`, `--phase`, `--model` filters) |
| `/gsd forensics` | Full-access GSD debugger — structured anomaly detection, unit traces, and LLM-guided root-cause analysis for auto-mode failures |
| `/gsd cleanup` | Clean up GSD state files and stale worktrees |
| `/gsd visualize` | Open workflow visualizer (progress, deps, metrics, timeline) |
| `/gsd export --html` | Generate self-contained HTML report for current or completed milestone |
| `/gsd export --html --all` | Generate retrospective reports for all milestones at once |
| `/gsd update` | Update GSD to the latest version in-session |
| `/gsd knowledge` | Add persistent project knowledge (rule, pattern, or lesson) |
| `/gsd fast` | Toggle service tier for supported models (prioritized API routing) |
| `/gsd rate` | Rate last unit's model tier (over/ok/under) — improves adaptive routing |
| `/gsd changelog` | Show categorized release notes |
| `/gsd logs` | Browse activity logs, debug logs, and metrics |
| `/gsd remote` | Control remote auto-mode |
| `/gsd help` | Categorized command reference with descriptions for all GSD subcommands |

## Configuration & Diagnostics

| Command | Description |
|---------|-------------|
| `/gsd prefs` | Model selection, timeouts, budget ceiling |
| `/gsd mode` | Switch workflow mode (solo/team) with coordinated defaults for milestone IDs, git commit behavior, and documentation |
| `/gsd config` | Re-run the provider setup wizard (LLM provider + tool keys) |
| `/gsd keys` | API key manager — list, add, remove, test, rotate, doctor |
| `/gsd doctor` | Runtime health checks with auto-fix — issues surface in real time across widget, visualizer, and HTML reports (v2.40) |
| `/gsd inspect` | Show SQLite DB diagnostics |
| `/gsd init` | Project init wizard — detect, configure, bootstrap `.gsd/` |
| `/gsd setup` | Global setup status and configuration |
| `/gsd skill-health` | Skill lifecycle dashboard — usage stats, success rates, token trends, staleness warnings |
| `/gsd skill-health <name>` | Detailed view for a single skill |
| `/gsd skill-health --declining` | Show only skills flagged for declining performance |
| `/gsd skill-health --stale N` | Show skills unused for N+ days |
| `/gsd hooks` | Show configured post-unit and pre-dispatch hooks |
| `/gsd run-hook` | Manually trigger a specific hook |
| `/gsd migrate` | Migrate a v1 `.planning` directory to `.gsd` format |

## Milestone Management

| Command | Description |
|---------|-------------|
| `/gsd new-milestone` | Create a new milestone |
| `/gsd skip` | Prevent a unit from auto-mode dispatch |
| `/gsd undo` | Revert last completed unit |
| `/gsd undo-task` | Reset a specific task's completion state (DB + markdown) |
| `/gsd reset-slice` | Reset a slice and all its tasks (DB + markdown) |
| `/gsd park` | Park a milestone — skip without deleting |
| `/gsd unpark` | Reactivate a parked milestone |
| Discard milestone | Available via `/gsd` wizard → "Milestone actions" → "Discard" |

## Parallel Orchestration

| Command | Description |
|---------|-------------|
| `/gsd parallel start` | Analyze eligibility, confirm, and start workers |
| `/gsd parallel status` | Show all workers with state, progress, and cost |
| `/gsd parallel stop [MID]` | Stop all workers or a specific milestone's worker |
| `/gsd parallel pause [MID]` | Pause all workers or a specific one |
| `/gsd parallel resume [MID]` | Resume paused workers |
| `/gsd parallel merge [MID]` | Merge completed milestones back to main |

See [Parallel Orchestration](./parallel-orchestration.md) for full documentation.

## Workflow Templates (v2.42)

| Command | Description |
|---------|-------------|
| `/gsd start` | Start a workflow template (bugfix, spike, feature, hotfix, refactor, security-audit, dep-upgrade, full-project) |
| `/gsd start resume` | Resume an in-progress workflow |
| `/gsd templates` | List available workflow templates |
| `/gsd templates info <name>` | Show detailed template info |

## Custom Workflows (v2.42)

| Command | Description |
|---------|-------------|
| `/gsd workflow new` | Create a new workflow definition (via skill) |
| `/gsd workflow run <name>` | Create a run and start auto-mode |
| `/gsd workflow list` | List workflow runs |
| `/gsd workflow validate <name>` | Validate a workflow definition YAML |
| `/gsd workflow pause` | Pause custom workflow auto-mode |
| `/gsd workflow resume` | Resume paused custom workflow auto-mode |

## Extensions

| Command | Description |
|---------|-------------|
| `/gsd extensions list` | List all extensions and their status |
| `/gsd extensions enable <id>` | Enable a disabled extension |
| `/gsd extensions disable <id>` | Disable an extension |
| `/gsd extensions info <id>` | Show extension details |

## cmux Integration

| Command | Description |
|---------|-------------|
| `/gsd cmux status` | Show cmux detection, prefs, and capabilities |
| `/gsd cmux on` | Enable cmux integration |
| `/gsd cmux off` | Disable cmux integration |
| `/gsd cmux notifications on/off` | Toggle cmux desktop notifications |
| `/gsd cmux sidebar on/off` | Toggle cmux sidebar metadata |
| `/gsd cmux splits on/off` | Toggle cmux visual subagent splits |

## GitHub Sync (v2.39)

| Command | Description |
|---------|-------------|
| `/github-sync bootstrap` | Initial setup — creates GitHub Milestones, Issues, and draft PRs from current `.gsd/` state |
| `/github-sync status` | Show sync mapping counts (milestones, slices, tasks) |

Enable with `github.enabled: true` in preferences. Requires `gh` CLI installed and authenticated. Sync mapping is persisted in `.gsd/.github-sync.json`.

## Git Commands

| Command | Description |
|---------|-------------|
| `/worktree` (`/wt`) | Git worktree lifecycle — create, switch, merge, remove |

## Session Management

| Command | Description |
|---------|-------------|
| `/clear` | Start a new session (alias for `/new`) |
| `/exit` | Graceful shutdown — saves session state before exiting |
| `/kill` | Kill GSD process immediately |
| `/model` | Switch the active model |
| `/login` | Log in to an LLM provider |
| `/thinking` | Toggle thinking level during sessions |
| `/voice` | Toggle real-time speech-to-text (macOS, Linux) |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+G` | Toggle dashboard overlay |
| `Ctrl+Alt+V` | Toggle voice transcription |
| `Ctrl+Alt+B` | Show background shell processes |
| `Ctrl+V` / `Alt+V` | Paste image from clipboard (screenshot → vision input) |
| `Escape` | Pause auto mode (preserves conversation) |

> **Note:** In terminals without Kitty keyboard protocol support (macOS Terminal.app, JetBrains IDEs), slash-command fallbacks are shown instead of `Ctrl+Alt` shortcuts.
>
> **Tip:** If `Ctrl+V` is intercepted by your terminal (e.g. Warp), use `Alt+V` instead for clipboard image paste.

## CLI Flags

| Flag | Description |
|------|-------------|
| `gsd` | Start a new interactive session |
| `gsd --continue` (`-c`) | Resume the most recent session for the current directory |
| `gsd --model <id>` | Override the default model for this session |
| `gsd --print "msg"` (`-p`) | Single-shot prompt mode (no TUI) |
| `gsd --mode <text\|json\|rpc\|mcp>` | Output mode for non-interactive use |
| `gsd --list-models [search]` | List available models and exit |
| `gsd --web [path]` | Start browser-based web interface (optional project path) |
| `gsd --worktree` (`-w`) [name] | Start session in a git worktree (auto-generates name if omitted) |
| `gsd --no-session` | Disable session persistence |
| `gsd --extension <path>` | Load an additional extension (can be repeated) |
| `gsd --append-system-prompt <text>` | Append text to the system prompt |
| `gsd --tools <list>` | Comma-separated list of tools to enable |
| `gsd --version` (`-v`) | Print version and exit |
| `gsd --help` (`-h`) | Print help and exit |
| `gsd sessions` | Interactive session picker — list all saved sessions for the current directory and choose one to resume |
| `gsd --debug` | Enable structured JSONL diagnostic logging for troubleshooting dispatch and state issues |
| `gsd config` | Set up global API keys for search and docs tools (saved to `~/.gsd/agent/auth.json`, applies to all projects). See [Global API Keys](./configuration.md#global-api-keys-gsd-config). |
| `gsd update` | Update GSD to the latest version |
| `gsd headless new-milestone` | Create a new milestone from a context file (headless — no TUI required) |

## Headless Mode

`gsd headless` runs `/gsd` commands without a TUI — designed for CI, cron jobs, and scripted automation. It spawns a child process in RPC mode, auto-responds to interactive prompts, detects completion, and exits with meaningful exit codes.

```bash
# Run auto mode (default)
gsd headless

# Run a single unit
gsd headless next

# Instant JSON snapshot — no LLM, ~50ms
gsd headless query

# With timeout for CI
gsd headless --timeout 600000 auto

# Force a specific phase
gsd headless dispatch plan

# Create a new milestone from a context file and start auto mode
gsd headless new-milestone --context brief.md --auto

# Create a milestone from inline text
gsd headless new-milestone --context-text "Build a REST API with auth"

# Pipe context from stdin
echo "Build a CLI tool" | gsd headless new-milestone --context -
```

| Flag | Description |
|------|-------------|
| `--timeout N` | Overall timeout in milliseconds (default: 300000 / 5 min) |
| `--max-restarts N` | Auto-restart on crash with exponential backoff (default: 3). Set 0 to disable |
| `--json` | Stream all events as JSONL to stdout |
| `--model ID` | Override the model for the headless session |
| `--context <file>` | Context file for `new-milestone` (use `-` for stdin) |
| `--context-text <text>` | Inline context text for `new-milestone` |
| `--auto` | Chain into auto-mode after milestone creation |

**Exit codes:** `0` = complete, `1` = error or timeout, `2` = blocked.

Any `/gsd` subcommand works as a positional argument — `gsd headless status`, `gsd headless doctor`, `gsd headless dispatch execute`, etc.

### `gsd headless query`

Returns a single JSON object with the full project snapshot — no LLM session, no RPC child, instant response (~50ms). This is the recommended way for orchestrators and scripts to inspect GSD state.

```bash
gsd headless query | jq '.state.phase'
# "executing"

gsd headless query | jq '.next'
# {"action":"dispatch","unitType":"execute-task","unitId":"M001/S01/T03"}

gsd headless query | jq '.cost.total'
# 4.25
```

**Output schema:**

```json
{
  "state": {
    "phase": "executing",
    "activeMilestone": { "id": "M001", "title": "..." },
    "activeSlice": { "id": "S01", "title": "..." },
    "activeTask": { "id": "T01", "title": "..." },
    "registry": [{ "id": "M001", "status": "active" }, ...],
    "progress": { "milestones": { "done": 0, "total": 2 }, "slices": { "done": 1, "total": 3 } },
    "blockers": []
  },
  "next": {
    "action": "dispatch",
    "unitType": "execute-task",
    "unitId": "M001/S01/T01"
  },
  "cost": {
    "workers": [{ "milestoneId": "M001", "cost": 1.50, "state": "running", ... }],
    "total": 1.50
  }
}
```

## MCP Server Mode

`gsd --mode mcp` runs GSD as a [Model Context Protocol](https://modelcontextprotocol.io) server over stdin/stdout. This exposes all GSD tools (read, write, edit, bash, etc.) to external AI clients — Claude Desktop, VS Code Copilot, and any MCP-compatible host.

```bash
# Start GSD as an MCP server
gsd --mode mcp
```

The server registers all tools from the agent session and maps MCP `tools/list` and `tools/call` requests to GSD tool definitions. It runs until the transport closes.

## In-Session Update

`/gsd update` checks npm for a newer version of GSD and installs it without leaving the session.

```bash
/gsd update
# Current version: v2.36.0
# Checking npm registry...
# Updated to v2.37.0. Restart GSD to use the new version.
```

If already up to date, it reports so and takes no action.

## Export

`/gsd export` generates reports of milestone work.

```bash
# Generate HTML report for the active milestone
/gsd export --html

# Generate retrospective reports for ALL milestones at once
/gsd export --html --all
```

Reports are saved to `.gsd/reports/` with a browseable `index.html` that links to all generated snapshots.

## Manual Testing

`/gsd test` launches an interactive manual test runner. It generates test cases from actual source code analysis (or UAT files if present), walks you through them one by one, and persists each verdict instantly so nothing is lost on crash or interrupt.

### Commands

| Command | Description |
|---------|-------------|
| `/gsd test` | Test most recently completed slice (or all if multiple are done) |
| `/gsd test <sliceId>` | Test a specific completed slice (e.g. `/gsd test S01`) |
| `/gsd test all` | Test all completed slices in the active milestone |
| `/gsd test results` | Show results from the last manual test session |

### How It Works

1. **Pauses auto-mode** if running, snapshots current progress
2. **Generates test cases** using a three-tier fallback:
   - **UAT file** — if `S01-UAT.md` exists, it's parsed into checks (highest priority)
   - **Smart code-aware generation** — analyzes actual source files referenced in task summaries/plans, extracts testable signals (API routes, React components, validation schemas, error handlers, CLI commands, exported functions), and synthesizes concrete test checks with specific HTTP methods/paths, component names, and expected behaviors
   - **Plan-text extraction** — falls back to slice plan text if no source files are available
3. **Checks for interrupted sessions** — if a previous session was interrupted, merges saved verdicts onto freshly-generated checks and resumes from the first unjudged check
4. **Opens a TUI overlay** showing one test at a time with steps and expected results
5. **You record verdicts** using keyboard shortcuts:

| Key | Action |
|-----|--------|
| `P` / `Enter` | Mark as **PASS**, advance to next |
| `F` | Mark as **FAIL** — type failure notes, press Enter |
| `S` | **Skip** this check |
| `←` / `→` | Navigate between checks (review previous) |
| `Q` / `Esc` | Quit early (all recorded verdicts are preserved) |
| `?` | Show help |

6. **Persists each verdict instantly** — every pass/fail/skip is saved to the DB the moment you record it, not just on session finish. If the process crashes or you quit mid-session, all recorded verdicts survive.
7. **If failures exist**, presents three options:
   - **Fix now** — the agent analyzes each failure's notes and fixes the code automatically
   - **Fix later** — saves results for later; resume pipeline when ready
   - **Accept as-is** — mark failures as known issues, continue the pipeline

### Smart Test Generation

When no UAT file exists, GSD analyzes source files to produce specific, actionable test cases. For example:

- **API routes** → "POST `/api/users` with `{name: "test"}` → expect 201 with `id` field"
- **React components** → "Render `UserProfile` with valid props → expect name displayed"
- **Validation schemas** → "Submit form with empty `email` field → expect validation error"
- **Error handlers** → "Trigger error condition → expect graceful error response"

Checks are capped at 15 per slice with proportional allocation (60% test-case, 40% edge-case). Signal extraction uses regex-based heuristics prioritized as: routes > validation > error handlers > components > CLI > exports.

### Incremental Persistence & Resume

Every verdict is persisted to the DB the instant you record it. The session row is pre-inserted before the TUI launches, so even a hard kill preserves all work done up to that point.

When you re-run `/gsd test` after an interruption, GSD detects the in-progress session, merges your saved verdicts onto freshly-generated checks (handling cases where checks were added, removed, or reordered between runs), and starts at the first unjudged check. You never re-test something you already passed.

### Opportunistic Fix Dispatch

In auto-mode, GSD automatically checks for outstanding unfixed test failures at three natural stopping points:

- After slice completion
- Before milestone validation
- Before milestone completion

If failures are found, a `fix-manual-tests` unit is dispatched automatically — no explicit "fix now" selection required. Anti-refire logic ensures each set of failures is only dispatched once.

### Fix Flow

When you choose "Fix now" (or auto-mode dispatches it), GSD creates a `fix-manual-tests` dispatch unit containing every failure with your exact notes. The agent:

- Reads the relevant source code for each failing feature
- Diagnoses root causes based on your notes
- Fixes the code and verifies each fix
- Reports what was changed

This runs as the next unit in auto-mode, then the pipeline continues normally.

### Artifacts

Results are written to:

- **Per-slice:** `.gsd/milestones/<MID>/slices/<SID>/<SID>-MANUAL-TEST-RESULT.md`
- **All-slices:** `.gsd/milestones/<MID>/<MID>-MANUAL-TEST-RESULT.md`

The result file includes a summary table, failed check details with your notes, and a state snapshot showing exactly where testing occurred in the pipeline.
