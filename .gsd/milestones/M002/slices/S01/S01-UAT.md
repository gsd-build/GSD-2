# S01: Safe slash-command dispatch and RPC-backed daily controls — UAT

**Milestone:** M002
**Written:** March 15, 2026

## UAT Type

- UAT mode: mixed
- Why this mode is sufficient: S01 is primarily guarded by contract and integration tests, but the user-visible claim is specifically about real browser slash-command behavior and browser-native surfaces, so one live staged-host smoke pass is still required.

## Preconditions

- `npm run build:web-host` has passed for the current checkout.
- A staged standalone host is running from `dist/web/standalone/server.js` with `GSD_WEB_PROJECT_CWD` pointing at this repo.
- The workspace can reach at least one configured provider so the shell is unlocked for normal command testing.
- The current project has existing sessions available so `/session`, `/resume`, and `/fork` have real targets.
- Use a disposable profile or test fixture if you intend to exercise `/logout` against persisted auth.

## Smoke Test

Open the browser workspace, type `/model` into the terminal input, and confirm the shared browser command surface opens on the model flow instead of adding `/model` to the model transcript.

## Test Cases

### 1. Typed and clicked settings or model controls share the same browser surface

1. Open the workspace and click the sidebar **Settings** affordance.
2. Confirm `[data-testid="command-surface"]` opens and the surface shows inspectable section state via `[data-testid="command-surface-kind"]`.
3. Close the surface.
4. Type `/model` into the terminal input and submit it.
5. **Expected:** The same shared surface reopens on the model flow, showing that typed slash input and clicked settings controls reuse one browser path rather than diverging.

### 2. Session-oriented built-ins open real browser-native controls

1. Type `/session` and confirm the shared sheet opens on the session section.
2. Verify session stats and export controls are visible inside `[data-testid="command-surface-session"]`.
3. Switch to the resume section and confirm resumable session targets are listed.
4. Switch to the compact section, enter short instructions, and run compact.
5. **Expected:** The surface loads real session data, resume targets come from live current-project sessions, and compact leaves an inspectable success or failure result in the surface instead of relying on transcript ambiguity.

### 3. Deferred built-ins reject clearly instead of falling through to the model

1. Close any open command surface.
2. Type `/share` into the terminal and submit it.
3. Inspect the terminal or recent-activity system lines.
4. **Expected:** A browser-visible rejection message explains that `/share` is blocked instead of falling through to the model, and no assistant prompt exchange is started for the rejected built-in.

### 4. GSD-specific slash commands remain on the supported extension path

1. Type `/gsd status` into the terminal and submit it.
2. Observe the terminal/request behavior.
3. **Expected:** The command is preserved on the existing prompt or extension-command path; it is not reclassified as a built-in, rejected, or swallowed by the browser dispatcher.

### 5. Auth controls use the same browser surface and expose failure state

1. Type `/login` and confirm the shared command surface opens on the auth flow.
2. If using persisted auth-file credentials in a disposable profile, type `/logout`.
3. If using environment-backed auth instead, type `/logout` and observe the failure state.
4. **Expected:** Login/logout use the same shared browser surface, successful auth-file logout refreshes onboarding state, and environment-backed auth logout fails clearly with sanitized browser-visible guidance instead of pretending logout succeeded.

## Edge Cases

### Environment-backed auth cannot be cleared by browser logout

1. Launch the staged host with the provider configured only through environment/runtime auth and no saved auth file.
2. Submit `/logout` from the browser terminal.
3. **Expected:** The command surface shows a clear sanitized error explaining that browser logout cannot remove environment/runtime-backed auth, and the onboarding/bridge state remains inspectable.

## Failure Signals

- `/model`, `/thinking`, `/settings`, `/login`, `/logout`, `/resume`, `/fork`, `/session`, `/export`, or `/compact` appear as plain transcript text instead of executing or opening the shared browser surface.
- `/share`, `/copy`, `/changelog`, `/hotkeys`, `/tree`, `/reload`, or `/quit` disappear into the transcript instead of producing an explicit reject line.
- `/gsd status`, `/worktree list`, `/wt list`, `/kill`, or `/exit` are rejected or rerouted as built-ins.
- Session, compaction, model, thinking, or auth actions fail without leaving inspectable busy, result, or error state in the command surface.
- Browser logout claims success while environment-backed auth remains active, or any auth failure leaks raw secrets.

## Requirements Proved By This UAT

- R011 — the browser now safely owns the daily-use built-ins covered by S01, with explicit execute, surface, local, or reject behavior while preserving supported GSD extension commands.

## Not Proven By This UAT

- Full browser parity for all remaining lower-frequency TUI capabilities beyond the S01 command set.
- Live freshness, recovery diagnostics, refresh/reopen continuity hardening, and the final real-runtime assembled proof that belong to S02-S04.

## Notes for Tester

Prefer scoped selectors and data-testid markers over broad body-text checks. This workspace is dense enough that whole-page text assertions can be noisy even when the command surface and terminal notice rows are correct.
