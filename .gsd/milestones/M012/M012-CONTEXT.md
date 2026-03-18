# M012: Web UX Polish & Upstream Sync v2.30

**Gathered:** 2026-03-18
**Status:** Ready for planning

## Project Description

GSD Web Host — a Next.js web UI for the GSD coding agent, maintained as a fork of gsd-build/gsd-2. This milestone covers six pieces of work: upstream merge (440 commits), beta tag in header, unified file editor for non-markdown, image drag-and-drop input, bridge PTY wiring for dual terminal, and an onboarding CTA guided dialog.

## Why This Milestone

The fork has fallen significantly behind upstream (v2.22 → v2.30, 440 commits). Several UX gaps exist: image input is missing from web terminals, file editing is awkwardly split for code files, the dual terminal isn't connected to the real GSD session, and the onboarding CTAs fire commands without guiding users visually.

## User-Visible Outcome

### When this milestone is complete, the user can:

- See a "beta" pill next to the logo in the header
- Drag or paste images into the chat mode input and the right-side interactive terminal
- Edit non-markdown files in a single unified view with syntax highlighting and Ctrl+S to save
- See the left terminal in power mode showing raw output from the actual running GSD session
- Press CTA buttons on the welcome dashboard and get a guided dialog with full chat-mode rendering connected to the root bridge session
- Use all existing web features on a codebase current with upstream v2.30

### Entry point / environment

- Entry point: `gsd web` CLI command / `http://localhost:3000`
- Environment: local dev / browser
- Live dependencies involved: GSD bridge process (child process RPC), PTY sessions (node-pty)

## Completion Class

- Contract complete means: build compiles clean, web host starts, bridge connects
- Integration complete means: all six feature areas work in the running web UI
- Operational complete means: none — local dev only

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- The web host builds and starts cleanly on the merged codebase
- A user can open chat mode, drag an image onto the input, and send a message with it
- A user can open power mode and see the left terminal streaming from the bridge, right terminal running independently
- A user can open a file, edit it inline, and save with Ctrl+S
- A user landing on a fresh project dashboard can press the CTA and get a guided dialog

## Risks and Unknowns

- **Upstream merge conflict volume** — 440 commits diverged from 267 local commits. Conflicts concentrated in `src/` where the bridge hooks into core modules. This is the highest-risk item.
- **Bridge PTY tap feasibility** — The bridge uses `stdio: ["pipe", "pipe", "pipe"]` for JSON-line RPC, not a PTY. Getting raw TUI output from the bridge process into the left terminal may require spawning a parallel PTY session or adding a PTY stream alongside the RPC pipes.
- **Chat rendering extraction** — The onboarding dialog needs the full chat-mode rendering pipeline. Extracting shared components from the 2400-line `chat-mode.tsx` cleanly without duplication is architecturally tricky.
- **Image input bridge protocol** — The bridge communicates via typed JSON RPC commands. Image content (base64) needs to flow through this protocol. Need to verify the upstream agent API accepts image content blocks.

## Existing Codebase / Prior Art

- `web/components/gsd/app-shell.tsx` — Header with logo, line ~250. Beta tag goes here.
- `web/components/gsd/file-content-viewer.tsx` — Two-tab (View/Edit) system. `isMarkdown()` at line 96 provides the seam.
- `web/components/gsd/dual-terminal.tsx` — Both terminals spawn independent `gsd` via `ShellTerminal`. Left needs bridge wiring.
- `web/components/gsd/chat-mode.tsx` — 2400 lines. Chat rendering pipeline, message parsing, input bar. Source for dialog extraction.
- `web/components/gsd/project-welcome.tsx` — CTA variants for blank/brownfield/v1-legacy. Currently calls `onCommand()`.
- `web/components/gsd/dashboard.tsx` — Renders `ProjectWelcome` when detection kind is not active-gsd/empty-gsd.
- `web/lib/pty-chat-parser.ts` — ANSI stripper, message segmenter, TUI prompt detector. Used by chat-mode.
- `web/lib/pty-manager.ts` — node-pty session management. `getOrCreateSession()` spawns PTY processes.
- `web/lib/gsd-workspace-store.tsx` — Central state, bridge SSE subscription, `sendCommand()`.
- `src/web/bridge-service.ts` — Bridge service, RPC child process, event emitter. `stdio: ["pipe", "pipe", "pipe"]`.
- `web/app/api/terminal/stream/route.ts` — SSE endpoint streaming PTY output to browser.
- `web/app/api/session/command/route.ts` — POST endpoint for sending commands to bridge.

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R001–R013 — All active requirements are owned by this milestone's slices
- R014 — Deferred: UI for new upstream features

## Scope

### In Scope

- Upstream merge v2.22→v2.30 (squash strategy)
- Beta pill badge in header
- Unified read/edit for non-markdown files with Save button + Ctrl+S
- Image drag-and-drop and paste for chat mode input and right-side interactive terminal
- Left terminal wired to bridge/main GSD PTY
- Onboarding CTA guided dialog with full chat-mode rendering connected to root bridge

### Out of Scope / Non-Goals

- Web UI surfaces for new upstream features (R014 — deferred)
- Rebasing local history onto upstream (R015 — out of scope)
- Mobile responsive design
- Automated testing for new features (manual verification sufficient for this milestone)

## Technical Constraints

- Bridge uses JSON-line RPC over stdio pipes — cannot directly expose as PTY without architectural change
- `chat-mode.tsx` is 2400 lines — extraction must be careful to avoid breaking existing chat mode
- Upstream merge touches `src/` heavily — `web/` is fork-only so no upstream conflicts there
- node-pty requires native compilation — PTY features depend on platform support

## Integration Points

- **Upstream remote** (`gsd-build/gsd-2`) — merge source, 440 commits
- **Bridge service** (`src/web/bridge-service.ts`) — PTY tap for left terminal, command routing for onboarding dialog
- **PTY manager** (`web/lib/pty-manager.ts`) — session management for terminal sessions
- **Agent session events** — image content blocks need to flow through the RPC protocol

## Open Questions

- **Bridge PTY approach** — Spawn a parallel PTY that runs the same GSD instance as the bridge, or add a PTY alongside the RPC pipes? Research needed in S05.
- **Image protocol** — Does the upstream agent API (v2.30) accept image content blocks in user messages? Need to verify during S04 research.
