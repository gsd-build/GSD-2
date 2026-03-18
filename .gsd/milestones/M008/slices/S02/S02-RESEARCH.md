# S02 (Browser Update UI) — Research

**Date:** 2026-03-18
**Depth:** Targeted — known technology (API routes, child-process services, React components) applied to a well-established codebase pattern, with one non-trivial async concern (D082).

## Summary

This slice adds browser-visible update notification and in-app update triggering (R117). The TUI already has `src/update-check.ts` (npm registry check with cache) and `src/update-cmd.ts` (synchronous `execSync('npm install -g gsd-pi@latest')`). The browser needs: (1) an API route to check for updates, (2) an API route to trigger an async update, and (3) a banner component in the app-shell.

The version check is simple — the API route can directly `fetch` the npm registry and compare versions. No child-process needed for the GET path since the comparison logic (`compareSemver`) is trivial to inline. The update trigger (POST) must be async per D082 — spawn `npm install -g gsd-pi@latest` as a child process and track its lifecycle. The banner slots into `app-shell.tsx` which already uses `toast` from `sonner` for notifications. The `Toaster` is already mounted in `layout.tsx`.

## Recommendation

Build a new `src/web/update-service.ts` for the server-side logic and a new `/api/update/route.ts` for the HTTP surface, following the established service+route pattern used by `doctor-service.ts`, `forensics-service.ts`, etc. The GET handler fetches the npm registry directly (no child process needed — it's just a network call plus semver comparison). The POST handler spawns `npm install -g gsd-pi@latest` via `execFile`/`spawn` and tracks state in a module-level variable (the update is a singleton process — only one can run at a time). An `UpdateBanner` component renders conditionally in `app-shell.tsx` when an update is available.

## Implementation Landscape

### Key Files

- `src/update-check.ts` — Has `checkForUpdates()`, `compareSemver()`, `readUpdateCache()`, `writeUpdateCache()`. Uses `.js` import extensions (`import { appRoot } from './app-paths.js'`). The comparison logic is simple enough to reimplement in the service; the npm registry URL pattern is `https://registry.npmjs.org/gsd-pi/latest`.
- `src/update-cmd.ts` — Has `runUpdate()` using `execSync('npm install -g gsd-pi@latest')`. Uses `.js` extensions. This is the synchronous TUI path — the browser needs an async adaptation.
- `src/web/bridge-service.ts` — `resolveBridgeRuntimeConfig()` returns `{ packageRoot, projectCwd, projectSessionsDir }`. `collectBootPayload()` at line 1970 assembles the boot response. Current `BridgeBootPayload` (line 552) has no version/update fields.
- `src/web/doctor-service.ts` — Reference implementation for the child-process service pattern: `execFile` with `resolveTsLoaderPath`, `validateModulePaths`, `Promise<string>` wrapper.
- `web/app/api/doctor/route.ts` — Reference implementation for API route pattern: GET + POST, `resolveProjectCwd(request)`, `Response.json()`, error handling.
- `web/components/gsd/app-shell.tsx` — Main app shell. Already imports `toast` from `sonner`. The `UpdateBanner` renders here, above the main content area.
- `web/app/layout.tsx` — Already has `<Toaster position="bottom-right" />` from sonner.
- `web/lib/gsd-workspace-store.tsx` — Workspace store. Update state could be tracked here or locally in the banner component. Local is simpler since update state doesn't need to be shared across surfaces.
- `src/loader.ts` — Sets `process.env.GSD_VERSION` from package.json at line 90-95. This env var is available in the web host process.

### Build Order

1. **Update service** (`src/web/update-service.ts`) — The server-side logic. GET: fetch npm registry, compare with `process.env.GSD_VERSION`, return `{ currentVersion, latestVersion, updateAvailable }`. POST: spawn `npm install -g gsd-pi@latest` as async child process, track state in module-level singleton (`idle | running | success | error`), return current status. GET also returns update-in-progress status so the banner can poll.
2. **API route** (`web/app/api/update/route.ts`) — Thin HTTP layer calling the service. GET returns version check + update status. POST triggers the update. Standard error handling pattern.
3. **UpdateBanner component** — Renders in `app-shell.tsx`. On mount, calls GET `/api/update`. If `updateAvailable`, shows a dismissible banner with version info and "Update" button. Clicking the button calls POST, then polls GET for status. Uses `toast` for success/error feedback.

### Verification Approach

- `npm run build:web-host` exits 0 — proves the new route and component compile
- Manual: launch `gsd --web`, observe banner if a newer version exists on npm registry
- Manual: click Update, observe async progress, verify success toast on completion
- Route-level: GET `/api/update` returns well-formed JSON with `currentVersion`, `latestVersion`, `updateAvailable` fields

## Constraints

- `src/update-check.ts` and `src/update-cmd.ts` use `.js` import extensions — Turbopack cannot resolve these (per KNOWLEDGE.md). The service cannot import them directly. Either reimplement the needed logic (preferred for the simple comparison/fetch) or use the child-process pattern.
- The npm registry fetch in the GET handler needs a timeout (5s is what `update-check.ts` uses) to avoid blocking the route.
- `process.env.GSD_VERSION` is set by `src/loader.ts` — it's available in the web host process. If missing, fall back to reading `package.json` from `packageRoot`.
- The POST update (`npm install -g gsd-pi@latest`) runs as the current user — it needs write permissions to the global npm prefix. This is the same constraint as the TUI's `runUpdate()`.
- Only one update can run at a time — the service needs a singleton guard.

## Common Pitfalls

- **Don't import from `src/update-check.ts` directly** — the `.js` extension imports will break Turbopack. Reimplement `compareSemver` (it's 8 lines) and inline the registry fetch.
- **Don't use `execSync` for the POST handler** — per D082, the browser cannot block on synchronous shell commands. Use `spawn` or `execFile` with event-based completion tracking.
- **Module-level state for update progress** — Since the Next.js server is long-lived, module-level variables persist across requests. This is the right place for the singleton update state (same pattern as bridge service's singleton map). But it also means the state survives across hot-module reloads in dev — handle the `running` → orphan case gracefully.
