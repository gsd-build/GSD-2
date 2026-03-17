---
estimated_steps: 5
estimated_files: 5
---

# T01: Create types, services, and API routes for knowledge and captures

**Slice:** S05 — Knowledge and captures/triage page
**Milestone:** M003

## Description

Build the complete server-side data pipeline: browser-safe types, two service files (captures via child-process, knowledge via direct file read), and two API routes. These are all new files — no modification of existing large files required.

Follow the established S04 pattern exactly: `forensics-service.ts` for the child-process pattern, `web/app/api/forensics/route.ts` for the API route pattern, `web/lib/diagnostics-types.ts` for the types file pattern.

## Steps

1. **Create `web/lib/knowledge-captures-types.ts`** — browser-safe types:

   ```ts
   // KnowledgeEntry — a single parsed entry from KNOWLEDGE.md
   export interface KnowledgeEntry {
     id: string          // e.g. "K001" for table rows, "freeform-1" for headings
     title: string       // heading text or table rule text
     content: string     // prose body or table row details
     type: "rule" | "pattern" | "lesson" | "freeform"
   }

   export interface KnowledgeData {
     entries: KnowledgeEntry[]
     filePath: string       // absolute path to KNOWLEDGE.md
     lastModified: string | null  // ISO timestamp of file mtime, null if file missing
   }

   // Mirror of upstream CaptureEntry from captures.ts
   export type Classification = "quick-task" | "inject" | "defer" | "replan" | "note"

   export interface CaptureEntry {
     id: string
     text: string
     timestamp: string
     status: "pending" | "triaged" | "resolved"
     classification?: Classification
     resolution?: string
     rationale?: string
     resolvedAt?: string
     executed?: boolean
   }

   export interface CapturesData {
     entries: CaptureEntry[]
     pendingCount: number
     actionableCount: number
   }

   export interface CaptureResolveRequest {
     captureId: string
     classification: Classification
     resolution: string
     rationale: string
   }

   export interface CaptureResolveResult {
     ok: boolean
     captureId: string
     error?: string
   }
   ```

2. **Create `src/web/captures-service.ts`** — child-process service for captures data:

   Follow `src/web/forensics-service.ts` exactly for structure. Key points:
   - Import `execFile` from `node:child_process`, `existsSync` from `node:fs`, `join` from `node:path`
   - Import `resolveBridgeRuntimeConfig` from `./bridge-service.ts`
   - Import types from `../../web/lib/knowledge-captures-types.ts`
   - `resolveCaputresModulePath(packageRoot)` → `join(packageRoot, "src", "resources", "extensions", "gsd", "captures.ts")`
   - `resolveTsLoaderPath(packageRoot)` → `join(packageRoot, "src", "resources", "extensions", "gsd", "tests", "resolve-ts.mjs")`
   - `collectCapturesData()` — child script:
     ```
     const { pathToFileURL } = await import("node:url");
     const mod = await import(pathToFileURL(process.env.GSD_CAPTURES_MODULE).href);
     const all = mod.loadAllCaptures(process.env.GSD_CAPTURES_BASE);
     const pending = all.filter(c => c.status === "pending");
     const actionable = mod.loadActionableCaptures(process.env.GSD_CAPTURES_BASE);
     const result = { entries: all, pendingCount: pending.length, actionableCount: actionable.length };
     process.stdout.write(JSON.stringify(result));
     ```
   - `resolveCaptureAction(request: CaptureResolveRequest)` — child script:
     ```
     const { pathToFileURL } = await import("node:url");
     const mod = await import(pathToFileURL(process.env.GSD_CAPTURES_MODULE).href);
     mod.markCaptureResolved(process.env.GSD_CAPTURES_BASE, <id>, <classification>, <resolution>, <rationale>);
     process.stdout.write(JSON.stringify({ ok: true, captureId: <id> }));
     ```
   - Pass `GSD_CAPTURES_MODULE` and `GSD_CAPTURES_BASE` via env, same as forensics uses `GSD_FORENSICS_MODULE` and `GSD_FORENSICS_BASE`
   - Use `execFile(process.execPath, ["--import", resolveTsLoader, "--experimental-strip-types", "--input-type=module", "--eval", script], ...)`
   - Set `maxBuffer: 2 * 1024 * 1024`

3. **Create `src/web/knowledge-service.ts`** — direct file read for KNOWLEDGE.md:

   This does NOT need a child process because KNOWLEDGE.md has a deterministic path and no `.js` extension imports.
   - Import `existsSync`, `readFileSync`, `statSync` from `node:fs`, `join` from `node:path`
   - Import `resolveBridgeRuntimeConfig` from `./bridge-service.ts`
   - Import `KnowledgeEntry`, `KnowledgeData` from `../../web/lib/knowledge-captures-types.ts`
   - `collectKnowledgeData()`:
     1. Get `projectCwd` from `resolveBridgeRuntimeConfig()`
     2. Build path: `join(projectCwd, ".gsd", "KNOWLEDGE.md")`
     3. If file doesn't exist, return `{ entries: [], filePath, lastModified: null }`
     4. Read file, get mtime via `statSync`
     5. Parse with `parseKnowledgeFile(content)`
     6. Return `{ entries, filePath, lastModified: mtime.toISOString() }`
   - `parseKnowledgeFile(content: string): KnowledgeEntry[]`:
     - Split into sections by `## ` headings
     - Skip the first section if it's just `# Knowledge Base` or `# Project Knowledge` (top-level heading)
     - For each `## Title` section:
       - Check if body contains table rows matching `| K\d{3} |` or `| P\d{3} |` or `| L\d{3} |`
       - If table rows found: parse each row as a structured entry with id from first column, type inferred from prefix (K=rule, P=pattern, L=lesson)
       - If no table rows: create a freeform entry with `id: "freeform-N"`, `type: "freeform"`, `title` from heading, `content` from body text

4. **Create `web/app/api/knowledge/route.ts`** — GET handler:

   Follow `web/app/api/forensics/route.ts` exactly:
   ```ts
   import { collectKnowledgeData } from "../../../../src/web/knowledge-service.ts"

   export const runtime = "nodejs"
   export const dynamic = "force-dynamic"

   export async function GET(): Promise<Response> {
     try {
       const payload = await collectKnowledgeData()
       return Response.json(payload, { headers: { "Cache-Control": "no-store" } })
     } catch (error) {
       const message = error instanceof Error ? error.message : String(error)
       return Response.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } })
     }
   }
   ```

5. **Create `web/app/api/captures/route.ts`** — GET + POST handlers:

   Same pattern as above for GET. POST additionally:
   ```ts
   export async function POST(request: Request): Promise<Response> {
     try {
       const body = await request.json()
       // Validate required fields: captureId, classification, resolution, rationale
       const result = await resolveCaptureAction(body)
       return Response.json(result, { headers: { "Cache-Control": "no-store" } })
     } catch (error) {
       const message = error instanceof Error ? error.message : String(error)
       return Response.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } })
     }
   }
   ```
   - Import both `collectCapturesData` and `resolveCaptureAction` from `captures-service.ts`
   - Validate POST body has `captureId` (string), `classification` (one of the 5 valid values), `resolution` (string), `rationale` (string) — return 400 if missing/invalid

## Must-Haves

- [ ] `web/lib/knowledge-captures-types.ts` has all types: `KnowledgeEntry`, `KnowledgeData`, `CapturesData`, `CaptureEntry`, `CaptureResolveRequest`, `CaptureResolveResult`, `Classification`
- [ ] `src/web/captures-service.ts` uses child-process pattern matching `forensics-service.ts` — `execFile` with `--import resolve-ts.mjs --experimental-strip-types`
- [ ] `src/web/knowledge-service.ts` reads KNOWLEDGE.md directly, handles both freeform and table formats
- [ ] `/api/knowledge` GET route returns `KnowledgeData` JSON
- [ ] `/api/captures` GET route returns `CapturesData` JSON
- [ ] `/api/captures` POST route validates body and calls `resolveCaptureAction()`
- [ ] `npm run build` succeeds

## Verification

- `npm run build` — TypeScript compilation of all new files exits 0
- Inspect: all 5 new files exist and have correct imports/exports

## Inputs

- `src/web/forensics-service.ts` — reference pattern for child-process service (read for exact `execFile` arguments, env var passing, error handling)
- `web/app/api/forensics/route.ts` — reference pattern for API route (read for exact structure)
- `web/lib/diagnostics-types.ts` — reference pattern for browser-safe types file (read for style)
- `src/web/bridge-service.ts` — provides `resolveBridgeRuntimeConfig()` with `projectCwd` and `packageRoot`
- `src/resources/extensions/gsd/captures.ts` — upstream module with `loadAllCaptures`, `loadActionableCaptures`, `markCaptureResolved` exports and `CaptureEntry` type

## Expected Output

- `web/lib/knowledge-captures-types.ts` — all browser-safe types for knowledge and captures
- `src/web/captures-service.ts` — child-process service with `collectCapturesData()` and `resolveCaptureAction()`
- `src/web/knowledge-service.ts` — direct-read service with `collectKnowledgeData()` and `parseKnowledgeFile()`
- `web/app/api/knowledge/route.ts` — GET route
- `web/app/api/captures/route.ts` — GET + POST route
