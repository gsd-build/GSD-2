# S04: Remote Questions Settings

**Goal:** Add a remote questions configuration section to the web settings panel for Slack/Discord/Telegram channels.
**Demo:** Slack/Discord/Telegram channel type, channel ID, timeout, and poll interval are configurable from the web settings panel.

## Must-Haves

- A "Remote Questions" section appears in the settings panel
- User can select channel type (Slack/Discord/Telegram)
- User can enter channel ID with format validation
- User can set timeout (1-30 minutes) and poll interval (2-30 seconds)
- Configuration reads from and writes to `remote_questions` in preferences.md via the preferences API
- `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0
- Remote questions section renders in settings with all fields

## Tasks

- [x] **T01: Remote questions settings panel + preferences wiring** `est:1.5h`
  - Why: Need the full UI section and the API wiring to read/write remote_questions config
  - Files: `web/components/gsd/settings-panels.tsx`, `web/lib/settings-types.ts`, `web/app/api/settings-data/route.ts`
  - Do: Add `RemoteQuestionsConfig` type to `settings-types.ts`. Add a `RemoteQuestionsPanel` component to settings-panels.tsx with: channel type selector (Slack/Discord/Telegram), channel ID text input with format hint, timeout minutes input (1-30), poll interval seconds input (2-30). The panel reads initial values from the settings-data route (extend to include remote_questions from preferences). Saving writes via a new or extended preferences API endpoint that updates the `remote_questions` block in preferences.md. Use the child-process service pattern to call `loadEffectiveGSDPreferences()` for reading.
  - Verify: `npm run build:web-host` exits 0
  - Done when: Remote questions panel renders with all fields, reads/writes preferences

## Files Likely Touched

- `web/components/gsd/settings-panels.tsx`
- `web/lib/settings-types.ts`
- `web/app/api/settings-data/route.ts`
- `src/web/settings-data-service.ts` (if it needs extension)
