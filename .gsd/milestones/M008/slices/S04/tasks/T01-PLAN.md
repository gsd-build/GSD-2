---
estimated_steps: 7
estimated_files: 4
---

# T01: Remote questions settings panel + preferences wiring

**Slice:** S04 — Remote Questions Settings
**Milestone:** M008

## Description

Add a RemoteQuestionsPanel to the web settings surface with channel type, channel ID, timeout, and poll interval fields, wired to read/write the `remote_questions` block in preferences.md.

## Steps

1. Read `src/resources/extensions/gsd/preferences.ts` to understand `RemoteQuestionsConfig` shape and validation
2. Read `src/resources/extensions/remote-questions/config.ts` to understand channel ID format patterns and validation
3. Add `RemoteQuestionsConfig` to `web/lib/settings-types.ts`
4. Read `src/web/settings-data-service.ts` and extend it to include `remote_questions` from loaded preferences
5. Build `RemoteQuestionsPanel` component in `settings-panels.tsx`: channel type dropdown (Slack/Discord/Telegram), channel ID text input with format hint per channel type, timeout minutes (1-30, default 5), poll interval (2-30, default 5). Show env var requirement hint (e.g. "Requires SLACK_BOT_TOKEN env var")
6. Wire save: POST/PUT to a preferences endpoint that writes the `remote_questions` block. Use the existing `web/app/api/settings-data/route.ts` or create a dedicated write route.
7. Run `npm run build:web-host` to verify

## Must-Haves

- [ ] `RemoteQuestionsConfig` type in settings-types.ts
- [ ] `RemoteQuestionsPanel` renders with all 4 fields
- [ ] Panel reads current config from settings-data route
- [ ] Panel writes config to preferences
- [ ] Channel ID format hints match upstream validation patterns
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0

## Inputs

- `src/resources/extensions/gsd/preferences.ts` — `RemoteQuestionsConfig` interface
- `src/resources/extensions/remote-questions/config.ts` — `CHANNEL_ID_PATTERNS` validation
- `web/components/gsd/settings-panels.tsx` — existing settings panel patterns
- `web/app/api/settings-data/route.ts` — existing settings data aggregation

## Expected Output

- `web/lib/settings-types.ts` — extended with RemoteQuestionsConfig
- `web/components/gsd/settings-panels.tsx` — new RemoteQuestionsPanel
- `web/app/api/settings-data/route.ts` — extended to include remote_questions
- `src/web/settings-data-service.ts` — extended to return remote_questions
