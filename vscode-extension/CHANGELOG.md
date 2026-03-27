# Changelog

## [0.2.0]

### Added

- **Activity feed** — real-time TreeView showing tool executions (Read, Write, Edit, Bash, Grep, Glob) with status icons, duration, and click-to-open
- **Workflow controls** — sidebar buttons for Auto, Next, Quick Task, Capture, Status, and Fork that send `/gsd` slash commands
- **Progress notifications** — VS Code notification with cancel button while the agent is working
- **Context window indicator** — color-coded usage bar (green/yellow/red) in sidebar with configurable threshold warnings
- **Session forking** — fork from any message via QuickPick using `get_fork_messages` and `fork` RPC commands
- **Queue mode controls** — toggle steering and follow-up modes (all vs one-at-a-time) from the sidebar
- **Enhanced conversation history** — tool call rendering, collapsible thinking blocks, search/filter, fork-from-here buttons
- **Enhanced code lens** — Refactor, Find Bugs, and Generate Tests actions alongside Ask GSD
- **4 new settings** — `showProgressNotifications`, `activityFeedMaxItems`, `showContextWarning`, `contextWarningThreshold`
- **8 new commands** (33 total) — `clearActivity`, `forkSession`, `toggleSteeringMode`, `toggleFollowUpMode`, `refactorSymbol`, `findBugsSymbol`, `generateTestsSymbol`

### Changed

- Sidebar session table now shows steering and follow-up queue mode with clickable toggle badges
- Token usage section includes context window usage bar when model context window is known

## [0.1.0]

Initial release.

- Full RPC client — spawns `gsd --mode rpc`, JSON line framing, all RPC commands
- Sidebar dashboard — connection status, model info, thinking level, token usage, cost, quick actions
- Chat participant — `@gsd` in VS Code Chat with streaming responses
- File decorations — "G" badge on files modified by the agent
- Bash terminal — pseudoterminal routing agent Bash tool output
- Session tree — browse and switch between session files
- Conversation history — webview panel with full chat log
- Slash command completion — auto-complete for `/gsd` commands in editors
- Code lens — "Ask GSD" above functions and classes in TS/JS/Python/Go/Rust
- 25 commands with 6 keyboard shortcuts
- Auto-start, auto-compaction, and code lens configuration
