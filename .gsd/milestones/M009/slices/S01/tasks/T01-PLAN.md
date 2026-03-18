---
estimated_steps: 5
estimated_files: 1
---

# T01: Add POST handler to /api/files with path validation and write security

**Slice:** S01 — File Write API & Editor Font Size
**Milestone:** M009

## Description

Add a POST handler to the existing `/api/files` route that accepts `{ path, content, root }` as a JSON body, validates the path using the same `resolveSecurePath()` the GET handler already uses, and writes the file to disk. This is the security-critical piece — S02's Save button depends on this endpoint existing and being safe.

The existing route file already has `resolveSecurePath()`, `getRootForMode()`, `resolveProjectCwd()`, and `MAX_FILE_SIZE` — all are module-private functions/constants that the POST handler can use directly since it's in the same file.

## Steps

1. In `web/app/api/files/route.ts`, add `writeFileSync` to the `node:fs` import and `dirname` to the `node:path` import.
2. Add an exported `POST` async function that:
   - Wraps the entire body in try/catch for JSON parse errors → return 400 `{ error: "Invalid JSON body" }`
   - Parses body with `await request.json()` extracting `{ path: pathParam, content, root: rootParam }`
   - Validates `rootParam` is `"gsd"` or `"project"` (default to `"gsd"` if missing) → 400 if invalid
   - Validates `content` is a string (not undefined, not a number) → 400 if invalid
   - Validates `Buffer.byteLength(content, "utf-8") <= MAX_FILE_SIZE` → 413 if exceeded
   - Calls `resolveProjectCwd(request)` to get the project CWD
   - Calls `getRootForMode(rootParam, projectCwd)` to get the root directory
   - Calls `resolveSecurePath(pathParam, root)` → 400 if null (same error message style as GET handler)
   - Checks `existsSync(dirname(resolvedPath))` → 404 if parent directory missing (with message "Parent directory does not exist")
   - Calls `writeFileSync(resolvedPath, content, "utf-8")`
   - Returns `Response.json({ success: true })`
3. Handle edge cases: allow `content === ""` (valid — clearing a file), allow writing to an existing file (overwrite) or a new file in an existing directory.
4. Test with `npm run build:web-host` to verify no type errors.
5. Verify with curl: valid write → 200, traversal → 400, missing parent → 404, oversized → 413.

## Must-Haves

- [ ] POST handler exists and is exported from `route.ts`
- [ ] Uses `resolveSecurePath()` for path validation — rejects `..`, absolute paths, paths escaping root
- [ ] Returns 400 for invalid/traversal paths, 404 for missing parent dir, 413 for oversized content
- [ ] Allows empty string content (clearing a file is valid)
- [ ] Uses `writeFileSync` with `"utf-8"` encoding
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0
- Start the dev/production server and test:
  - `curl -X POST 'http://localhost:3000/api/files?project=...' -H 'Content-Type: application/json' -d '{"path":"test-write-verify.txt","content":"hello from POST","root":"project"}'` → 200 `{ success: true }`, file exists on disk with correct content
  - `curl -X POST ... -d '{"path":"../../etc/passwd","content":"x","root":"gsd"}'` → 400
  - `curl -X POST ... -d '{"path":"nonexistent-deep/nested/file.txt","content":"x","root":"project"}'` → 404
  - Clean up the test file after verification

## Observability Impact

- **New signal:** POST `/api/files` returns structured JSON `{ error: "..." }` with HTTP 400/404/413 for all rejection paths — agents and UI can programmatically inspect why a write was rejected.
- **Inspection:** `curl -v -X POST /api/files?project=... -d '...'` shows status code + JSON body for any write attempt.
- **Failure visibility:** Path traversal attempts return 400 with descriptive message; missing parent dirs return 404 with "Parent directory does not exist"; oversized content returns 413. All use the same `{ error }` shape as the existing GET handler.

## Inputs

- `web/app/api/files/route.ts` — existing GET-only route with `resolveSecurePath()`, `getRootForMode()`, `resolveProjectCwd()`, `MAX_FILE_SIZE` already defined

## Expected Output

- `web/app/api/files/route.ts` — now exports both `GET` and `POST` handlers; POST writes files with full path validation and appropriate error status codes
