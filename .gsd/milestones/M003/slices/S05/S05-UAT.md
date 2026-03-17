# S05: Knowledge and captures/triage page — UAT

**Milestone:** M003
**Written:** 2026-03-16

## UAT Type

- UAT mode: mixed (artifact-driven for builds/types, live-runtime for API routes and panel rendering)
- Why this mode is sufficient: The slice produces API routes returning real data and a panel rendering that data — both must be verified against running services, but contract/type correctness is proven by build success.

## Preconditions

- `npm run build` passes (TypeScript compilation)
- `npm run build:web-host` passes (Next.js production build)
- Web host is running: `npm run dev:web-host` or production mode
- A `.gsd/KNOWLEDGE.md` file exists in the project directory (the current project has one)
- A `.gsd/CAPTURES.md` file may or may not exist (behavior differs — test both)

## Smoke Test

Open browser terminal, type `/gsd knowledge`. The command surface should open showing a Knowledge tab with parsed entries from KNOWLEDGE.md. If you see placeholder content ("Knowledge" heading with no data), the wiring failed.

## Test Cases

### 1. /gsd knowledge opens Knowledge tab with real entries

1. Start the web host with `npm run dev:web-host`
2. Open browser terminal
3. Type `/gsd knowledge`
4. **Expected:** Command surface opens. Knowledge tab is active (not Captures). Entries from `.gsd/KNOWLEDGE.md` are displayed with type badges — "rule", "pattern", "lesson", or "freeform". Each entry shows a title and content body.

### 2. /gsd capture opens Captures tab

1. Type `/gsd capture` in browser terminal
2. **Expected:** Same panel opens but with Captures tab active. If captures exist, entries show status badges (pending/triaged/resolved) and classification labels. If no captures file exists, an empty state message is shown.

### 3. /gsd triage opens Captures tab (same as capture)

1. Type `/gsd triage` in browser terminal
2. **Expected:** Same panel opens with Captures tab active — identical behavior to `/gsd capture`.

### 4. Tab switching between Knowledge and Captures

1. Open the panel via `/gsd knowledge`
2. Click the "Captures" tab
3. Click the "Knowledge" tab
4. **Expected:** Both tabs switch instantly without additional loading spinners (data pre-loaded on section open).

### 5. /api/knowledge GET returns structured data

1. `curl http://localhost:3000/api/knowledge | jq`
2. **Expected:** JSON response with `{ entries: [...], filePath: "...", lastModified: "..." }`. Each entry has `id`, `title`, `content`, `type` fields. Types are one of "rule", "pattern", "lesson", "freeform".

### 6. /api/captures GET returns structured data

1. `curl http://localhost:3000/api/captures | jq`
2. **Expected:** JSON response with `{ entries: [...], pendingCount: N, actionableCount: N }`. Each entry has `id`, `text`, `timestamp`, `status` fields.

### 7. /api/captures POST validates required fields

1. `curl -X POST http://localhost:3000/api/captures -H 'Content-Type: application/json' -d '{}'`
2. **Expected:** 400 response with `{ "error": "Missing or invalid field: captureId (string required)" }`
3. `curl -X POST http://localhost:3000/api/captures -H 'Content-Type: application/json' -d '{"captureId":"X"}'`
4. **Expected:** 400 response with error about missing classification field
5. `curl -X POST http://localhost:3000/api/captures -H 'Content-Type: application/json' -d '{"captureId":"X","classification":"invalid"}'`
6. **Expected:** 400 response with error listing valid classification values (quick-task, inject, defer, replan, note)

### 8. /api/captures POST with valid body

1. `curl -X POST http://localhost:3000/api/captures -H 'Content-Type: application/json' -d '{"captureId":"test-1","classification":"note","resolution":"done","rationale":"test"}'`
2. **Expected:** JSON response with `{ ok: true/false, captureId: "test-1" }` or an error field. The response depends on whether "test-1" is a valid capture ID in the project.

### 9. Knowledge entries parse both freeform and table formats

1. Verify `.gsd/KNOWLEDGE.md` contains freeform `## Heading` sections (prose content under headings)
2. `curl http://localhost:3000/api/knowledge | jq '.entries[] | .type'`
3. **Expected:** Mix of "freeform" entries (from heading sections) and potentially "rule"/"pattern"/"lesson" entries (from table rows with K/P/L prefixes, if present).

## Edge Cases

### KNOWLEDGE.md does not exist

1. Temporarily rename `.gsd/KNOWLEDGE.md` to `.gsd/KNOWLEDGE.md.bak`
2. `curl http://localhost:3000/api/knowledge | jq`
3. **Expected:** `{ entries: [], filePath: "...", lastModified: null }` — empty entries, no error
4. Restore the file

### CAPTURES.md does not exist (no captures in project)

1. If the project has no captures, `curl http://localhost:3000/api/captures | jq`
2. **Expected:** `{ entries: [], pendingCount: 0, actionableCount: 0 }` — empty state, no error

### Invalid JSON body on POST

1. `curl -X POST http://localhost:3000/api/captures -H 'Content-Type: application/json' -d 'not-json'`
2. **Expected:** 400 response with `{ "error": "Invalid JSON body" }`

### Empty string fields on POST

1. `curl -X POST http://localhost:3000/api/captures -H 'Content-Type: application/json' -d '{"captureId":"","classification":"note","resolution":"done","rationale":"test"}'`
2. **Expected:** 400 response with error about captureId being invalid (empty string rejected)

## Failure Signals

- `/gsd knowledge` shows placeholder text instead of real knowledge entries → command surface wiring broken
- `/gsd capture` or `/gsd triage` shows placeholder text → command surface wiring broken
- `/api/knowledge` returns 500 → knowledge-service.ts file read or parse failure
- `/api/captures` returns 500 → captures-service.ts subprocess failure
- Tab switching shows loading spinners → pre-loading on section open is broken
- Knowledge entries all show "freeform" type → table parser not working
- POST validation accepts invalid bodies → validation logic broken
- `npm run build:web-host` fails → import or type errors in new files

## Requirements Proved By This UAT

- R106 — Full verification: knowledge entries displayed with type badges, capture entries with status/classification, triage actions available, API routes returning real data
- R101 (partially) — `/gsd knowledge`, `/gsd capture`, `/gsd triage` dispatch to real surfaces with real content

## Not Proven By This UAT

- R109 (parity audit) — This UAT does not prove the knowledge/captures surface matches every TUI feature; that's S08's job
- Triage action end-to-end with real pending captures — depends on project having actual pending captures
- Cross-browser compatibility — tested in one browser only

## Notes for Tester

- The 4 pre-existing parity contract test failures (`/gsd visualize`) are known and unrelated to this slice — they're from S03's view-navigate dispatch design.
- If the project has no CAPTURES.md or no pending captures, the Captures tab will show empty state — this is correct behavior, not a bug.
- The Knowledge tab parser is best tested with the current project's KNOWLEDGE.md which has freeform heading sections (the "Git Merge", "Git Index Lock", etc. entries).
