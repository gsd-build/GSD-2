# GSD-2 — VS Code Extension

Control the [GSD-2 coding agent](https://github.com/gsd-build/gsd-2) directly from VS Code. Run autonomous coding sessions, chat with `@gsd` in VS Code Chat, and monitor your agent from a sidebar dashboard — all without leaving the editor.

## Requirements

GSD must be installed before activating this extension:

```bash
npm install -g gsd-pi
```

Node.js ≥ 20.6.0 and Git are required.

## Features

### Sidebar Dashboard

Click the GSD icon in the Activity Bar to open the agent dashboard. It shows:

- Connection status (connected / disconnected)
- Active model and provider
- Thinking level
- Token usage and session cost
- Quick action buttons: Start, Stop, New Session, Compact, Abort

### Chat Integration (`@gsd`)

Use `@gsd` in VS Code Chat (`Ctrl+Shift+I`) to send messages to the agent:

```
@gsd refactor the auth module to use JWT
@gsd /gsd auto
@gsd what's the current milestone status?
```

### Commands

All commands are accessible via `Ctrl+Shift+P`:

| Command | Description |
|---------|-------------|
| **GSD: Start Agent** | Connect to the GSD agent |
| **GSD: Stop Agent** | Disconnect the agent |
| **GSD: New Session** | Start a fresh conversation |
| **GSD: Send Message** | Send a message to the agent |
| **GSD: Abort Current Operation** | Interrupt the current operation |
| **GSD: Steer Agent** | Send a steering message mid-operation |
| **GSD: Switch Model** | Pick a model from QuickPick |
| **GSD: Cycle Model** | Rotate to the next configured model |
| **GSD: Set Thinking Level** | Choose off / low / medium / high |
| **GSD: Cycle Thinking Level** | Rotate through thinking levels |
| **GSD: Compact Context** | Manually trigger context compaction |
| **GSD: Export Conversation as HTML** | Save the session as HTML |
| **GSD: Show Session Stats** | Display token usage and cost |
| **GSD: Run Bash Command** | Execute a shell command via the agent |
| **GSD: List Available Commands** | Browse and run GSD slash commands |

### Keyboard Shortcuts

| Shortcut | Command |
|----------|---------|
| `Ctrl+Shift+G Ctrl+Shift+N` | New Session |
| `Ctrl+Shift+G Ctrl+Shift+M` | Cycle Model |
| `Ctrl+Shift+G Ctrl+Shift+T` | Cycle Thinking Level |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `gsd.binaryPath` | `"gsd"` | Path to the GSD binary if not on PATH |
| `gsd.autoStart` | `false` | Start the agent automatically when the extension activates |
| `gsd.autoCompaction` | `true` | Enable automatic context compaction |

## Quick Start

1. Install GSD: `npm install -g gsd-pi`
2. Install this extension
3. Open a project folder in VS Code
4. `Ctrl+Shift+P` → **GSD: Start Agent**
5. Use `@gsd` in Chat or the sidebar to interact with the agent

## How It Works

The extension spawns `gsd --mode rpc` in the background and communicates over JSON-RPC via stdin/stdout. All 25 RPC commands are supported, including streaming events for real-time sidebar updates.

## Links

- [GSD Documentation](https://github.com/gsd-build/gsd-2/tree/main/docs)
- [Getting Started](https://github.com/gsd-build/gsd-2/blob/main/docs/getting-started.md)
- [Issue Tracker](https://github.com/gsd-build/gsd-2/issues)
