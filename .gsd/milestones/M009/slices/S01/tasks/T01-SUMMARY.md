---
id: T01
parent: S01
milestone: M009
provides:
  - POST /api/files endpoint with path validation and write security
key_files:
  - web/app/api/files/route.ts
key_decisions:
  - Validate path after content to fail fast on bad root/content before doing filesystem work
patterns_established:
  - POST handler reuses same resolveSecurePath/getRootForMode/resolveProjectCwd as GET — single-file security surface
observability_surfaces:
  - POST /api/files returns structured { error } JSON with 400/404/413 status codes for all rejection paths
duration: 8m
verification_result: passed
blocker_discovered: false
---

# T01: Add POST handler to /api/files with path validation and write security

**Added POST /api/files that writes files to disk with full path validation using existing resolveSecurePath()**

## What Happened

Added `writeFileSync` and `dirname` to the fs/path imports. Implemented an exported `POST` handler that: parses JSON body with try/catch for malformed JSON (400), validates root is "gsd" or "project" (400), validates content is a string (400), checks content size against MAX_FILE_SIZE (413), validates path is a non-empty string (400), resolves path with `resolveSecurePath()` (400 if traversal), checks parent directory exists (404 if missing), then writes with `writeFileSync`. Empty string content is explicitly allowed.

## Verification

- `npm run build:web-host` — exits 0, no type errors
- Valid write (`test-write-verify.txt` with content "hello from POST") → 200 `{ success: true }`, file content confirmed on disk
- Path traversal (`../../etc/passwd`) → 400 with descriptive error
- Missing parent dir (`nonexistent-deep/nested/file.txt`) → 404 "Parent directory does not exist"
- Missing path field → 400 "Missing or invalid path"
- Empty content → 200 `{ success: true }`, file cleared on disk
- Invalid root → 400
- Absolute path (`/etc/passwd`) → 400

**Slice-level verification (T01 scope):**
- ✅ `curl -X POST .../api/files` valid write → 200 with `{ success: true }`
- ✅ `curl -X POST` path traversal → 400
- ✅ `curl -X POST` missing parent → 404
- ✅ `curl -X POST` missing path field → 400 with structured error
- ✅ `npm run build:web-host` exits 0
- ⬜ Editor font size settings panel (T02 scope)

## Diagnostics

- `curl -v -X POST 'http://localhost:3000/api/files?project=...' -H 'Content-Type: application/json' -d '{"path":"...","content":"...","root":"project"}'` — inspect status code and JSON body for any write attempt
- All error responses use `{ error: "..." }` shape matching the GET handler's convention

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `web/app/api/files/route.ts` — added writeFileSync/dirname imports and POST handler with full path validation
- `.gsd/milestones/M009/slices/S01/S01-PLAN.md` — added Observability / Diagnostics section and failure-path verification check
- `.gsd/milestones/M009/slices/S01/tasks/T01-PLAN.md` — added Observability Impact section
