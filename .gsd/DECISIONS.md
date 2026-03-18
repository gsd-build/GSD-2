# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| # | When | Scope | Decision | Choice | Rationale | Revisable? |
|---|------|-------|----------|--------|-----------|------------|
| D001 | M012 | arch | Upstream merge strategy | Squash merge upstream/main into local main | Preserves local 267-commit history, isolates conflict resolution in one commit, avoids rebasing risk | No |
| D002 | M012 | arch | Bridge left terminal approach | Raw PTY display from bridge process | User wants actual bridge process output in left terminal, not parsed chat rendering | Yes — if bridge PTY tap proves infeasible |
| D003 | M012 | pattern | Onboarding dialog rendering | Full chat-mode clone connected to root bridge session | User explicitly wants same rendering pipeline as chat mode, connected to root GSD session — not a simplified dialog or separate instance | No |
| D004 | M012 | pattern | File editor save mechanism | Save button on dirty + Ctrl+S / Cmd+S keyboard shortcut | Standard developer workflow, muscle memory shortcuts | No |
| D005 | M012 | scope | Upstream UI adaptation | Deferred to future milestone | Merge only — no new web UI surfaces for upstream features in M012 | Yes — next milestone |
| D006 | M012 | pattern | Beta tag style | Subtle pill badge, lowercase, muted colors | Blends with header chrome, non-intrusive | Yes |
| D007 | M012 | scope | Image input surfaces | Chat mode textarea + right-side interactive terminal | Left terminal is raw PTY (no custom input surface), onboarding dialog not included | Yes — if onboarding dialog needs it later |
