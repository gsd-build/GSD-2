# Commands Reference

## Execution Commands (`/run`)

| Command | Description |
|---------|-------------|
| `/gsd` | Step mode — execute one unit at a time, pause between each |
| `/run next` | Explicit step mode (same as `/gsd`) |
| `/run` | Autonomous mode — research, plan, execute, commit, repeat |
| `/run stop` | Stop auto mode gracefully |
| `/run pause` | Pause auto mode (same as Escape) |
| `/run dispatch` | Force dispatch a specific pipeline phase |
| `/run undo` | Undo the last completed unit |
| `/run skip` | Skip the current unit and advance |
| `/run parallel start` | Analyze eligibility, confirm, and start workers |
| `/run parallel status` | Show all workers with state, progress, and cost |
| `/run parallel stop [MID]` | Stop all workers or a specific milestone's worker |
| `/run parallel pause [MID]` | Pause all workers or a specific one |
| `/run parallel resume [MID]` | Resume paused workers |
| `/run parallel merge [MID]` | Merge completed milestones back to main |

## Planning Commands (`/plan`)

| Command | Description |
|---------|-------------|
| `/plan` | Start or resume a discussion flow |
| `/plan discuss` | Discuss architecture and decisions (works alongside auto mode) |
| `/plan queue` | Queue and reorder future milestones (safe during auto mode) |
| `/plan quick` | Execute a quick task with GSD guarantees (atomic commits, state tracking) without full planning overhead |
| `/plan capture` | Fire-and-forget thought capture (works during auto mode) |
| `/plan triage` | Manually trigger triage of pending captures |
| `/plan steer` | Hard-steer plan documents during execution |
| `/plan milestone` | Create a new milestone |
| `/plan knowledge` | Add persistent project knowledge (rule, pattern, or lesson) |

## Project Commands (`/gsd`)

| Command | Description |
|---------|-------------|
| `/gsd status` | Progress dashboard |
| `/gsd forensics` | Post-mortem investigation of auto-mode failures — structured root-cause analysis with log inspection |
| `/gsd cleanup` | Clean up GSD state files and stale worktrees |
| `/gsd visualize` | Open workflow visualizer (progress, deps, metrics, timeline) |
| `/gsd help` | Categorized command reference with descriptions for all GSD subcommands |

## Configuration & Diagnostics

| Command | Description |
|---------|-------------|
| `/gsd prefs` | Model selection, timeouts, budget ceiling |
| `/gsd mode` | Switch workflow mode (solo/team) with coordinated defaults for milestone IDs, git commit behavior, and documentation |
| `/gsd doctor` | Runtime health checks (7 checks) with auto-fix for common state corruption issues |
| `/gsd skill-health` | Skill lifecycle dashboard — usage stats, success rates, token trends, staleness warnings |
| `/gsd skill-health <name>` | Detailed view for a single skill |
| `/gsd skill-health --declining` | Show only skills flagged for declining performance |
| `/gsd skill-health --stale N` | Show skills unused for N+ days |
| `/gsd hooks` | Show configured post-unit and pre-dispatch hooks |
| `/gsd run-hook` | Manually trigger a specific hook |
| `/gsd migrate` | Migrate a v1 `.planning` directory to `.gsd` format |

See [Parallel Orchestration](./parallel-orchestration.md) for full documentation.

## Remote Questions

| Command | Description |
|---------|-------------|
| `/gsd remote` | Show remote questions menu and current status |
| `/gsd remote slack` | Set up Slack integration |
| `/gsd remote discord` | Set up Discord integration |
| `/gsd remote telegram` | Set up Telegram integration |
| `/gsd remote status` | Show current configuration and last prompt status |
| `/gsd remote disconnect` | Remove remote questions configuration |

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
| `gsd sessions` | Interactive session picker — list all saved sessions for the current directory and choose one to resume |
| `gsd --debug` | Enable structured JSONL diagnostic logging for troubleshooting dispatch and state issues |
| `gsd config` | Re-run the setup wizard (LLM provider + tool keys) |
| `gsd update` | Update GSD to the latest version |
| `gsd headless new-milestone` | Create a new milestone from a context file (headless — no TUI required) |

## Headless Mode

`gsd headless` runs `/gsd` commands without a TUI — designed for CI, cron jobs, and scripted automation. It spawns a child process in RPC mode, auto-responds to interactive prompts, detects completion, and exits with meaningful exit codes.

```bash
# Run auto mode (default)
gsd headless

# Run a single unit
gsd headless next

# Machine-readable output
gsd headless --json status

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
| `--json` | Stream all events as JSONL to stdout |
| `--model ID` | Override the model for the headless session |
| `--context <file>` | Context file for `new-milestone` (use `-` for stdin) |
| `--context-text <text>` | Inline context text for `new-milestone` |
| `--auto` | Chain into auto-mode after milestone creation |

**Exit codes:** `0` = complete, `1` = error or timeout, `2` = blocked.

Any subcommand works as a positional argument — `gsd headless status`, `gsd headless doctor`, `gsd headless dispatch execute`, etc.

## MCP Server Mode

`gsd --mode mcp` runs GSD as a [Model Context Protocol](https://modelcontextprotocol.io) server over stdin/stdout. This exposes all GSD tools (read, write, edit, bash, etc.) to external AI clients — Claude Desktop, VS Code Copilot, and any MCP-compatible host.

```bash
# Start GSD as an MCP server
gsd --mode mcp
```

The server registers all tools from the agent session and maps MCP `tools/list` and `tools/call` requests to GSD tool definitions. It runs until the transport closes.
