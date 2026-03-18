# S02: Web CI Workflow & Packaging Verification

**Goal:** A dedicated `web.yml` CI workflow validates the full web host build chain on push, and the npm packaging script verifies that the web standalone output is included in the tarball.
**Demo:** Pushing to a `feat/**` branch triggers `web.yml` which builds the web host (including Serwist), runs contract tests, and validates that `dist/web/standalone/server.js` is in the npm tarball — all green on `ubuntu-latest`.

## Must-Haves

- `scripts/validate-pack.js` checks for `dist/web/standalone/server.js`, `dist/web/standalone/public/manifest.json`, and `dist/web/standalone/public/sw.js` in the tarball
- `npm run validate-pack` exits 0 locally with the new checks
- `.github/workflows/web.yml` exists with push triggers on `main` and `feat/**`, PR trigger on `main`
- `web.yml` runs on `ubuntu-latest` only (per D096)
- `web.yml` installs both root and `web/` dependencies separately (`npm ci` then `npm --prefix web ci`)
- `web.yml` runs `npm run build`, `npm run build:web-host`, `npm run validate-pack`, `npm run test:unit`, and `npm run test:integration` in that order
- `npm run build:web-host` still exits 0 after all changes (regression guard)

## Verification

- `npm run validate-pack` exits 0 — confirms new web host file checks pass against the tarball
- `grep -q 'dist/web/standalone/server.js' scripts/validate-pack.js` — confirms the check was added
- `test -f .github/workflows/web.yml` — confirms workflow file exists
- `node -e "const y = require('js-yaml'); const f = require('fs').readFileSync('.github/workflows/web.yml','utf8'); const w = y.load(f); const ok = w.on.push.branches.includes('main') && w.jobs.build && w.jobs.build['runs-on'] === 'ubuntu-latest'; console.log(ok ? 'valid' : 'invalid'); process.exit(ok ? 0 : 1)"` — confirms workflow structure
- `npm run build:web-host` exits 0 — regression check that S01's build chain is intact

## Tasks

- [x] **T01: Extend validate-pack.js with web standalone file checks** `est:15m`
  - Why: R131 requires the npm tarball to include the web standalone host. The existing `validate-pack.js` only checks for `dist/loader.js`, `packages/pi-coding-agent/dist/index.js`, and `scripts/link-workspace-packages.cjs`. Adding web file checks proves the packaging pipeline includes S01's output.
  - Files: `scripts/validate-pack.js`
  - Do: Add three entries to the `requiredFiles` array: `dist/web/standalone/server.js`, `dist/web/standalone/public/manifest.json`, `dist/web/standalone/public/sw.js`. No structural changes to the script — just extend the array.
  - Verify: `npm run validate-pack` exits 0 and output shows no MISSING lines for the new entries
  - Done when: `npm run validate-pack` passes with the three new web host files checked

- [x] **T02: Create web.yml GitHub Actions workflow** `est:20m`
  - Why: R132 requires a `web.yml` workflow that validates the full web host build chain on push. Per D092, this is a separate workflow (not extending ci.yml). Per D096, ubuntu-latest only.
  - Files: `.github/workflows/web.yml`
  - Do: Create a new workflow file mirroring ci.yml's structure. Single `build` job on `ubuntu-latest`. Key difference from ci.yml: after `npm ci`, run `npm --prefix web ci` to install web dependencies separately (web/ is NOT an npm workspace). After `npm run build`, run `npm run build:web-host` (which runs `next build && serwist build && stage:web-host`). Then `npm run validate-pack`, `npm run test:unit`, `npm run test:integration`.
  - Verify: `test -f .github/workflows/web.yml` and YAML syntax validates
  - Done when: `.github/workflows/web.yml` exists with correct triggers, job structure, and step ordering

## Observability / Diagnostics

- **CI workflow visibility:** `web.yml` runs appear as a separate check in the GitHub Actions tab. Failed steps show inline logs with the exact npm command that failed and its stderr output.
- **validate-pack output:** `npm run validate-pack` prints each checked file with `OK:` or `MISSING:` prefix. Missing files cause exit 1 with a clear list of what's absent from the tarball.
- **Local inspection:** Run `npm run validate-pack` locally to exercise the full pack-then-check flow. Run `npm run build:web-host` to verify the web build chain independently.
- **Workflow structure check:** Use `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/web.yml'))"` to validate YAML syntax (js-yaml is not a project dependency).
- **Failure shapes:** Build failures surface as GitHub Actions step failures with full npm stderr. Packaging failures show `MISSING: <path>` lines in validate-pack output.

## Files Likely Touched

- `scripts/validate-pack.js`
- `.github/workflows/web.yml`
