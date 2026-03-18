# S02: gsd-2 RPC Connection + Event Stream — Research

**Date:** 2026-03-18

## Summary

S02 wires the Electron main process to a gsd-2 subprocess via JSON-RPC over stdin/stdout, bridges events to the renderer through Electron IPC, and dumps raw events into the center panel as proof the pipe works end-to-end. The technology is well-understood — the VS Code extension (`vscode-extension/src/gsd-client.ts`) already implements this exact pattern with a self-contained JSONL client, crash recovery, and pending-request management. The Electron main process needs an equivalent `GsdService` class, the preload bridge needs real `ipcMain`/`ipcRenderer` wiring instead of stubs, and the renderer needs a Zustand store to hold connection state and accumulated events.

The primary risk is not the protocol (it's battle-tested) but the Electron IPC bridge architecture — ensuring clean separation between the main process (Node.js, spawns gsd-2, owns the subprocess) and the renderer (React, receives events, sends commands). The preload `contextBridge` stub from S01 already defines the right shape (`onEvent`, `sendCommand`, `spawn`, `getStatus`); S02 replaces the stubs with real IPC calls.

There is one important architectural decision: should the Electron main process import `RpcClient` from `@gsd/pi-coding-agent`, or self-contain the JSONL client? The answer is self-contain. The `@gsd/pi-coding-agent` package is not in studio's dependencies, isn't built, and `RpcClient` spawns via `node dist/cli.js` which doesn't match the globally-installed `gsd` binary. The VS Code extension took the same approach — it re-declares minimal types and implements its own JSONL framing. The Electron main process should follow that pattern, spawning `gsd --mode rpc` directly.

## Recommendation

Follow the VS Code extension pattern: build a self-contained `GsdService` in the Electron main process that spawns `gsd --mode rpc`, implements LF-only JSONL framing, manages pending requests by ID, and forwards events to the renderer via `ipcMain`/`ipcRenderer`. Wire the preload bridge stubs to real IPC channels. Create a `session-store.ts` Zustand store in the renderer to hold connection status, raw events, and session state. Render raw events as formatted JSON in the center panel as the end-to-end proof.

Do NOT import from `@gsd/pi-coding-agent` — self-contain the types and JSONL implementation to avoid build/dependency coupling.

## Implementation Landscape

### Key Files

**Existing (consume from S01):**
- `studio/src/main/index.ts` — Electron main process. Currently creates BrowserWindow and loads renderer. S02 adds GsdService instantiation and IPC handler registration here.
- `studio/src/preload/index.ts` — contextBridge stub. Defines `StudioBridge` type with `onEvent`, `sendCommand`, `spawn`, `getStatus`. S02 replaces stub implementations with real `ipcRenderer.invoke`/`ipcRenderer.on` calls.
- `studio/src/preload/index.d.ts` — Global `Window` typing for `window.studio`. May need type updates if bridge shape changes.
- `studio/src/renderer/src/components/layout/CenterPanel.tsx` — Placeholder conversation surface. S02 replaces placeholder cards with raw event stream output.
- `studio/electron.vite.config.ts` — Build config for main/preload/renderer. No changes expected.
- `studio/package.json` — May need no new dependencies (Electron IPC is built-in).

**Reference (do not import, study for patterns):**
- `vscode-extension/src/gsd-client.ts` — Self-contained JSONL client with spawn, LF-only buffer draining, pending request map, crash recovery, connection state events. This is the primary pattern source.
- `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts` — Canonical type definitions for all RPC commands, responses, events, and extension UI requests/responses. Copy the subset needed.
- `packages/pi-coding-agent/src/modes/rpc/rpc-client.ts` — The SDK client. Shows the `handleLine` dispatch pattern (response vs event), pending request timeout, subprocess exit handling.
- `packages/pi-coding-agent/src/modes/rpc/jsonl.ts` — `serializeJsonLine` and `attachJsonlLineReader`. The LF-only framing implementation. The main process should implement equivalent logic directly (it's ~30 lines).
- `src/headless-events.ts` — `FIRE_AND_FORGET_METHODS` set (`notify`, `setStatus`, `setWidget`, `setTitle`, `set_editor_text`). The renderer needs to know which extension UI requests require a response.

**New files to create:**
- `studio/src/main/gsd-service.ts` — Main process gsd-2 subprocess manager. Spawns `gsd --mode rpc`, manages JSONL communication, forwards events to renderer, accepts commands from renderer. Handles crash detection and reconnection. This is the heart of S02.
- `studio/src/main/rpc-types.ts` — Self-contained type declarations for the RPC protocol subset the studio needs. Copied/simplified from `rpc-types.ts`. Keeps the main process decoupled from the agent package.
- `studio/src/renderer/src/stores/session-store.ts` — Zustand store holding: connection status (`disconnected` | `connecting` | `connected` | `error`), raw event log (for the proof display), session state (model, streaming status, session name), and pending extension UI requests.
- `studio/src/renderer/src/lib/rpc/use-gsd.ts` — React hook that subscribes to `window.studio.onEvent`, dispatches events to the Zustand store, and provides `sendCommand`/`spawn`/`respondToExtensionUI` actions.
- `studio/test/gsd-service.test.mjs` — Unit test for the JSONL framing and event dispatch logic (can test without actually spawning gsd-2 by mocking stdin/stdout).

### Build Order

**Task 1: GsdService + RPC types in main process.** This is the riskiest piece — subprocess lifecycle, JSONL framing, crash handling. Build it first so everything else has a working pipe. Can be verified by logging events to console before IPC is wired.

**Task 2: IPC bridge — preload + main process handlers.** Replace preload stubs with real `ipcRenderer.invoke`/`ipcRenderer.on`. Register `ipcMain.handle` for `gsd:spawn`, `gsd:send-command`, `gsd:status`. Use `webContents.send` for `gsd:event` forwarding from main→renderer. This is the glue layer.

**Task 3: Renderer store + hook + raw event display.** Create the Zustand store, the `useGsd` hook, and replace the center panel placeholder with a raw event stream. This proves the full pipeline: renderer → preload → main → gsd-2 → main → preload → renderer.

### Verification Approach

1. **Unit test:** `npm run test -w studio` — test JSONL framing (serialize/deserialize with edge cases like Unicode separators), event dispatch (response vs event routing), and pending request timeout.
2. **Build check:** `npm run build -w studio` — confirms TypeScript compilation succeeds for main, preload, and renderer with the new IPC types.
3. **Integration proof (manual):** `npm run dev -w studio` — launch the app, observe:
   - Console log in main process: `[gsd-service] spawned gsd --mode rpc (pid: XXXX)`
   - Connection status indicator in renderer UI changes from "disconnected" to "connected"
   - Type a prompt in the composer, click Send, observe raw JSON events streaming in the center panel
   - Kill the gsd-2 process externally, observe connection status changes to "error"/"disconnected" and auto-reconnect attempts
4. **LSP diagnostics:** Zero errors on all new/modified files.

## Constraints

- **LF-only JSONL framing** — Must NOT use Node's `readline` module. It splits on U+2028/U+2029 which are valid inside JSON strings. Implement manual buffer + `indexOf('\n')` splitting, matching the pattern in `jsonl.ts` and `gsd-client.ts`.
- **contextIsolation: true** — The renderer cannot access Node APIs directly. All main↔renderer communication goes through `contextBridge` + `ipcMain`/`ipcRenderer`. No `nodeIntegration`.
- **Extension UI response contract** — Interactive requests (`select`, `confirm`, `input`, `editor`) MUST be responded to or the agent blocks forever. Fire-and-forget methods (`notify`, `setStatus`, `setWidget`, `setTitle`, `set_editor_text`) do not need responses. The store must track pending interactive requests so the UI can render them (S05 builds the actual UI — S02 just needs to auto-respond or store them).
- **`prompt` is async** — `prompt` command returns immediately with acknowledgment. Actual work streams as events. Use `agent_end` event to detect completion. Don't await the prompt response expecting results.
- **gsd binary resolution** — Spawn `gsd --mode rpc`, not `node dist/cli.js`. The globally installed `gsd` binary at `/opt/homebrew/bin/gsd` is the entry point. Consider `process.env.GSD_BIN_PATH` override like the headless orchestrator does.
- **electron-vite v5 sensitivity** — Don't add new Vite-adjacent dependencies. The main process build is plain Rollup through electron-vite; only Node.js built-ins (`child_process`, `path`, etc.) and Electron APIs are available.

## Common Pitfalls

- **Forgetting to handle extension_ui_request in S02** — The agent will emit `extension_ui_request` events during real sessions. S02 doesn't build the wizard UI (that's S05), but it MUST either auto-respond to interactive requests or the agent blocks. Add a default auto-responder in the GsdService that responds to `select` with the first option, `confirm` with true, `input` with empty string, and `editor` with prefill. The store should still surface these events so S05 can intercept later.
- **Serializing functions through IPC** — `ipcRenderer.on` callbacks and `contextBridge` functions cannot carry non-serializable data. Event objects from gsd-2 are plain JSON so this is fine, but don't try to pass class instances or functions through the bridge.
- **Multiple BrowserWindow race** — The macOS `activate` handler in `main/index.ts` can create new windows. GsdService should be a singleton associated with the app, not per-window. Forward events to all windows or the focused window.
- **Subprocess orphan on crash** — If Electron crashes or is force-killed, the gsd-2 child process may orphan. Consider `process.on('exit')` and `app.on('before-quit')` cleanup in the main process.
- **Event buffering during reconnect** — If gsd-2 crashes and restarts, events from the previous session are lost. The store should track this state transition and show it in the UI (S02 can just clear the event log on reconnect).

## Open Risks

- **gsd binary path resolution in production** — During dev, `gsd` is on PATH. In a packaged Electron app, it may not be. This is a distribution concern (deferred to later), but the GsdService should accept a configurable binary path now so it's not hardcoded.
- **Extension UI auto-response correctness** — Auto-responding to all interactive requests with defaults may cause unexpected agent behavior in real sessions. S05 needs to replace auto-response with actual UI before the milestone ships. S02 should log a warning when auto-responding so it's visible during development.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| gsd-2 RPC protocol | `gsd-headless-rpc` | available locally (provided by user) |
| Electron IPC | n/a | well-documented, no skill needed |

## Sources

- VS Code extension client implementation — `vscode-extension/src/gsd-client.ts` (self-contained JSONL client with crash recovery, pending requests, LF-only framing)
- RPC protocol types — `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts` (canonical type definitions)
- RPC mode server — `packages/pi-coding-agent/src/modes/rpc/rpc-mode.ts` (extension UI request/response handling, command dispatch)
- JSONL framing — `packages/pi-coding-agent/src/modes/rpc/jsonl.ts` (LF-only implementation)
- Headless events — `src/headless-events.ts` (fire-and-forget method set, terminal notification detection)
- gsd-headless-rpc skill — `/Users/lexchristopherson/Downloads/gsd-headless-rpc/` (comprehensive protocol documentation)
