# M012: Web UX Polish & Upstream Sync v2.30

**Vision:** Bring the fork current with upstream v2.30, add image input, unify the file editor, wire the dual terminal to the real bridge session, and replace the onboarding CTA with a guided chat-mode dialog — all behind a subtle beta tag.

## Success Criteria

- User sees a "beta" pill next to the logo in the header
- User can drag/paste images into chat mode and the right-side interactive terminal
- Non-markdown files show a single unified read/edit view with syntax highlighting and Ctrl+S save
- Left terminal in power mode streams raw PTY output from the bridge's GSD session
- CTA buttons on the welcome dashboard open a full chat-mode guided dialog connected to the root bridge
- Build compiles clean on merged upstream v2.30 codebase
- All existing web UI features continue to work after merge

## Key Risks / Unknowns

- **Upstream merge volume** — 440 diverged commits, heavy conflicts expected in `src/`
- **Bridge PTY feasibility** — Bridge uses RPC pipes, not PTY. Left terminal needs raw TUI output from that process.
- **Chat rendering extraction** — 2400-line chat-mode.tsx must be cleanly split for dialog reuse
- **Image protocol support** — Need to verify agent API accepts image content blocks through RPC

## Proof Strategy

- Upstream merge volume → retire in S01 by proving build compiles and web host starts on merged code
- Bridge PTY feasibility → retire in S05 by proving left terminal shows live bridge output
- Chat rendering extraction → retire in S06 by proving dialog renders messages identically to chat mode
- Image protocol support → retire in S04 by proving an image can be sent and received by the agent

## Verification Classes

- Contract verification: build compiles, TypeScript clean, web host starts
- Integration verification: bridge connects, terminals stream, image reaches agent, dialog renders
- Operational verification: none — local dev only
- UAT / human verification: visual check of beta tag, file editor UX, dialog flow

## Milestone Definition of Done

This milestone is complete only when all are true:

- All six slices deliver working features
- Build compiles clean on the merged codebase
- Web host starts and bridge connects successfully
- Image input works end-to-end in chat mode
- File editor unified view works for non-markdown with Ctrl+S save
- Left terminal shows bridge output, right terminal runs independently
- Onboarding dialog opens and renders chat-mode responses from the root bridge
- Success criteria re-checked against live behavior

## Requirement Coverage

- Covers: R001, R002, R003, R004, R005, R006, R007, R008, R009, R010, R011, R012, R013
- Partially covers: none
- Leaves for later: R014
- Orphan risks: none

## Slices

- [ ] **S01: Upstream Merge v2.22→v2.30** `risk:high` `depends:[]`
  > After this: build compiles clean on merged codebase, web host starts and connects to bridge, all existing features work.

- [ ] **S02: Beta Tag & Header Polish** `risk:low` `depends:[S01]`
  > After this: subtle "beta" pill badge visible next to the logo in the app shell header.

- [ ] **S03: Unified File Editor for Non-Markdown** `risk:medium` `depends:[S01]`
  > After this: non-markdown files display in a single read/edit view with syntax highlighting, Save button on dirty, and Ctrl+S keyboard shortcut. Markdown files keep two-tab system.

- [ ] **S04: Image Input for Chat Mode & Interactive Terminal** `risk:medium` `depends:[S01]`
  > After this: user can drag or paste images into the chat mode textarea and the right-side interactive terminal in power mode.

- [ ] **S05: Bridge PTY in Left Terminal** `risk:high` `depends:[S01]`
  > After this: left terminal in power mode shows raw PTY output from the bridge's running GSD session. Right terminal remains an independent GSD instance.

- [ ] **S06: Onboarding CTA Guided Dialog** `risk:high` `depends:[S01,S05]`
  > After this: pressing CTA buttons on the blank/brownfield/v1-legacy welcome dashboard opens a full-screen dialog with chat-mode rendering connected to the root bridge session.

## Boundary Map

### S01 → S02, S03, S04, S05, S06

Produces:
- Merged codebase current with upstream v2.30
- Clean build with all existing `src/` and `web/` code compiling
- Bridge service compatible with upstream v2.30 agent API
- All existing web UI components functional on the new codebase

Consumes:
- nothing (first slice)

### S02 → (leaf)

Produces:
- Beta pill badge component in `app-shell.tsx` header

Consumes from S01:
- Clean merged codebase with working `app-shell.tsx`

### S03 → (leaf)

Produces:
- Unified `FileContentViewer` with single-view mode for non-markdown
- Save button + Ctrl+S keyboard shortcut handler
- Markdown files still use two-tab View/Edit

Consumes from S01:
- `file-content-viewer.tsx` on merged codebase
- `code-editor.tsx` (syntax highlighting component)

### S04 → (leaf)

Produces:
- Image drop zone + paste handler for chat mode input area
- Image encoding (base64) + bridge protocol integration
- Image drop/paste support for right-side terminal input (if PTY supports it)

Consumes from S01:
- `chat-mode.tsx` input area on merged codebase
- Bridge command protocol for sending image content
- `shell-terminal.tsx` for terminal image handling

### S05 → S06

Produces:
- Bridge PTY session — left terminal connected to bridge process output
- PTY stream API or bridge output tap mechanism
- Updated `dual-terminal.tsx` with asymmetric terminal configuration (bridge left, independent right)

Consumes from S01:
- `bridge-service.ts` on merged codebase
- `pty-manager.ts` for PTY session management
- `dual-terminal.tsx` and `shell-terminal.tsx`

### S06 → (leaf)

Produces:
- `GuidedDialog` component with full chat-mode rendering pipeline
- Extracted shared rendering components from `chat-mode.tsx`
- Dialog integration in `project-welcome.tsx` / `dashboard.tsx`
- Bridge session connection for dialog

Consumes from S05:
- Bridge PTY wiring pattern for connecting dialog to root bridge session
Consumes from S01:
- `chat-mode.tsx` rendering pipeline on merged codebase
- `project-welcome.tsx` CTA variant system
- `pty-chat-parser.ts` for message parsing
