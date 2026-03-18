# Requirements

This file is the explicit capability and coverage contract for the project.

## Active

### R001 — Beta tag in header
- Class: core-capability
- Status: active
- Description: A subtle pill badge reading "beta" appears next to the logo in the app shell header
- Why it matters: Communicates product maturity to users at a glance
- Source: user
- Primary owning slice: M012/S02
- Supporting slices: none
- Validation: unmapped
- Notes: Lowercase, muted colors, blends with header chrome

### R002 — Image drag-and-drop in chat mode
- Class: primary-user-loop
- Status: active
- Description: Users can drag images onto or paste images into the chat mode textarea to include them in messages sent to the GSD agent
- Why it matters: Matches TUI capability — image input is essential for visual debugging, screenshot sharing, and design reference
- Source: user
- Primary owning slice: M012/S04
- Supporting slices: none
- Validation: unmapped
- Notes: Needs both drag-and-drop zone and clipboard paste handling, plus base64 encoding for bridge protocol

### R003 — Image drag-and-drop in interactive terminal
- Class: primary-user-loop
- Status: active
- Description: Users can drag images onto or paste images into the right-side interactive terminal in dual terminal (power) mode
- Why it matters: Parity with chat mode — power users should also have image input
- Source: user
- Primary owning slice: M012/S04
- Supporting slices: none
- Validation: unmapped
- Notes: The right terminal is a separate GSD PTY session; image handling may differ from chat mode

### R004 — Unified read/edit for non-markdown files
- Class: primary-user-loop
- Status: active
- Description: Non-markdown files display in a single view with syntax highlighting where the user can both read and edit code in-place, instead of switching between separate Read and Edit tabs
- Why it matters: Two tabs for code files is awkward — developers expect to click into code and start editing
- Source: user
- Primary owning slice: M012/S03
- Supporting slices: none
- Validation: unmapped
- Notes: The existing `isMarkdown()` check at line 96 of file-content-viewer.tsx provides a clean seam

### R005 — Markdown files keep two-tab system
- Class: core-capability
- Status: active
- Description: Markdown files retain the existing View/Edit tab system with rendered markdown preview in the View tab and raw editing in the Edit tab
- Why it matters: Markdown benefits from rendered preview — code files don't
- Source: user
- Primary owning slice: M012/S03
- Supporting slices: none
- Validation: unmapped
- Notes: No change to current markdown behavior

### R006 — Save button + Ctrl+S for file editor
- Class: primary-user-loop
- Status: active
- Description: The unified file editor shows a Save button when content is dirty, and supports Ctrl+S (Cmd+S on Mac) keyboard shortcut to save
- Why it matters: Standard developer workflow — keyboard shortcut is muscle memory
- Source: user
- Primary owning slice: M012/S03
- Supporting slices: none
- Validation: unmapped
- Notes: Save button appears only when content has been modified

### R007 — Left terminal connected to bridge/main GSD instance
- Class: core-capability
- Status: active
- Description: The left terminal in power (dual terminal) mode displays raw PTY output from the bridge's main GSD process, not a separately spawned instance
- Why it matters: Users expect the left terminal to show the actual running GSD session, not a disconnected copy
- Source: user
- Primary owning slice: M012/S05
- Supporting slices: none
- Validation: unmapped
- Notes: The bridge currently uses stdio pipes for RPC, not a PTY. May need a parallel PTY tap or a dedicated PTY session wired to the bridge process. Research required.

### R008 — Right terminal is separate GSD instance
- Class: core-capability
- Status: active
- Description: The right terminal in power mode spawns and runs an independent GSD instance for interactive use
- Why it matters: Allows parallel exploration while the main session runs
- Source: user
- Primary owning slice: M012/S05
- Supporting slices: none
- Validation: unmapped
- Notes: This is close to current behavior — both terminals already spawn independent gsd processes. The change is making the left one use the bridge instead.

### R009 — Onboarding CTA opens guided dialog
- Class: primary-user-loop
- Status: active
- Description: When the dashboard shows the project welcome screen (blank, brownfield, or v1-legacy), pressing the CTA button opens a dialog instead of just sending a command
- Why it matters: A dialog provides a guided, visual experience for first-time setup rather than dumping users into a raw terminal
- Source: user
- Primary owning slice: M012/S06
- Supporting slices: none
- Validation: unmapped
- Notes: Applies to all three detection kinds: blank, brownfield, v1-legacy

### R010 — Guided dialog uses full chat-mode rendering
- Class: primary-user-loop
- Status: active
- Description: The onboarding guided dialog renders LLM responses using the same parsing and rendering pipeline as chat mode — parsed message blocks, markdown rendering, TUI prompt inputs, tool call displays
- Why it matters: Consistency — the guided experience should feel identical to the main chat interface, not a stripped-down version
- Source: user
- Primary owning slice: M012/S06
- Supporting slices: none
- Validation: unmapped
- Notes: Requires extracting shared rendering components from chat-mode.tsx

### R011 — Guided dialog connected to root GSD session
- Class: core-capability
- Status: active
- Description: The onboarding guided dialog communicates with the root/main GSD session (the bridge), not a separate instance
- Why it matters: The guided flow drives the actual project setup — it must use the real session so state persists
- Source: user
- Primary owning slice: M012/S06
- Supporting slices: none
- Validation: unmapped
- Notes: Uses the same bridge connection as chat mode

### R012 — Upstream merge v2.22→v2.30 (squash)
- Class: integration
- Status: active
- Description: Merge 440 upstream commits from gsd-build/gsd-2 (v2.22→v2.30) into the fork using a squash merge strategy
- Why it matters: The fork is significantly behind upstream — core improvements, bug fixes, and structural changes need to land
- Source: user
- Primary owning slice: M012/S01
- Supporting slices: none
- Validation: unmapped
- Notes: Squash merge preserves local commit history. Conflicts will be concentrated in src/ where the bridge hooks into core modules. web/ is fork-only so no upstream conflicts there.

### R013 — Existing web UI features don't regress after merge
- Class: quality-attribute
- Status: active
- Description: After the upstream merge, all existing web UI features continue to work — dashboard, chat mode, dual terminal, file viewer, settings, onboarding
- Why it matters: A merge that breaks existing functionality is worse than staying behind
- Source: user
- Primary owning slice: M012/S01
- Supporting slices: none
- Validation: unmapped
- Notes: Build must compile clean, web host must start and connect to bridge

## Validated

(none yet)

## Deferred

### R014 — Web UI surfaces for new upstream features
- Class: core-capability
- Status: deferred
- Description: Build web UI components to expose new upstream features added in v2.23–v2.30 (extension registry, worktree CLI, model health indicator, simplified auto pipeline, headless mode)
- Why it matters: New upstream capabilities should eventually be accessible from the web UI
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: User explicitly chose "merge only, adapt later" — circle back in a future milestone

## Out of Scope

### R015 — Rebase local history onto upstream
- Class: constraint
- Status: out-of-scope
- Description: Rebasing 267 local commits onto upstream/main
- Why it matters: Prevents scope confusion — squash merge was explicitly chosen over rebase
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Squash merge strategy confirmed during discussion

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | core-capability | active | M012/S02 | none | unmapped |
| R002 | primary-user-loop | active | M012/S04 | none | unmapped |
| R003 | primary-user-loop | active | M012/S04 | none | unmapped |
| R004 | primary-user-loop | active | M012/S03 | none | unmapped |
| R005 | core-capability | active | M012/S03 | none | unmapped |
| R006 | primary-user-loop | active | M012/S03 | none | unmapped |
| R007 | core-capability | active | M012/S05 | none | unmapped |
| R008 | core-capability | active | M012/S05 | none | unmapped |
| R009 | primary-user-loop | active | M012/S06 | none | unmapped |
| R010 | primary-user-loop | active | M012/S06 | none | unmapped |
| R011 | core-capability | active | M012/S06 | none | unmapped |
| R012 | integration | active | M012/S01 | none | unmapped |
| R013 | quality-attribute | active | M012/S01 | none | unmapped |
| R014 | core-capability | deferred | none | none | unmapped |
| R015 | constraint | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 13
- Mapped to slices: 13
- Validated: 0
- Unmapped active requirements: 0
