# Project

## What This Is

GSD Web Host — a Next.js web UI for the GSD coding agent, maintained as a fork of `gsd-build/gsd-2`. The web host provides a browser-based interface to GSD with multiple view modes (dashboard, chat, power/dual-terminal, files, activity, visualizer, projects), backed by a bridge service that spawns and communicates with GSD agent processes via RPC over stdio pipes. Terminal sessions use node-pty for real PTY access.

## Core Value

A browser-based GSD experience that matches or exceeds the TUI — structured chat rendering, project management, file editing, and multi-terminal workflows in one window.

## Current State

11 milestones completed (M001–M011). The web host is functional with:
- Dashboard with project detection (blank/brownfield/v1-legacy/active-gsd)
- Chat mode with parsed LLM response rendering, TUI prompt handling, action panels
- Power mode with dual split terminals (both currently spawn independent GSD instances)
- File browser with syntax-highlighted viewer/editor (two-tab read/edit for all files)
- Onboarding wizard, settings panels, activity view, visualizer
- Light/dark theme with system-aware toggle
- Multi-project workspace support
- PWA support with service worker and install prompt
- CI/CD workflow for web host builds

The fork is 267 local commits ahead and 440 upstream commits behind (v2.22 vs upstream v2.30).

## Architecture / Key Patterns

- **Next.js App Router** (`web/`) — standalone web app, not part of the upstream project
- **Bridge Service** (`src/web/bridge-service.ts`) — spawns GSD as child process, communicates via JSON-line RPC over stdio pipes, exposes events via SSE to the frontend
- **PTY Manager** (`web/lib/pty-manager.ts`) — manages node-pty sessions for shell terminals, separate from the bridge
- **Workspace Store** (`web/lib/gsd-workspace-store.tsx`) — central state management, subscribes to bridge SSE events
- **Chat Parser** (`web/lib/pty-chat-parser.ts`) — strips ANSI, segments messages, detects TUI prompts from PTY output
- **Component Structure** — all GSD components in `web/components/gsd/`, UI primitives in `web/components/ui/`
- **Upstream** — `gsd-build/gsd-2` tracked as `upstream` remote; `web/` directory is fork-only (doesn't exist upstream)

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [x] M001: Web mode foundation
- [x] M002: Web parity and hardening
- [x] M003: Upstream Sync and Full Web Feature Parity
- [x] M004: Web Mode Documentation and CI/CD Integration
- [x] M005: Light Theme with System-Aware Toggle
- [x] M006: Multi-Project Workspace
- [x] M007: Chat Mode — Consumer-Grade GSD Interface
- [x] M008: Web Polish
- [x] M009: Editor & File Viewer Upgrade
- [x] M010: Upstream Sync v2.22→v2.28
- [x] M011: CI/CD, Packaging & PWA
- [ ] M012: Web UX Polish & Upstream Sync v2.30 — Beta tag, image input, unified file editor, bridge terminal wiring, onboarding guided dialog, upstream merge
