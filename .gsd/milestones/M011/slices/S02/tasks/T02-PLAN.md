---
estimated_steps: 4
estimated_files: 1
---

# T02: Create web.yml GitHub Actions workflow

**Slice:** S02 — Web CI Workflow & Packaging Verification
**Milestone:** M011

## Description

Create `.github/workflows/web.yml` — a dedicated CI workflow for the web host build chain (R132). Per D092, this is separate from `ci.yml` for independent failure reporting. Per D096, it runs on `ubuntu-latest` only (no macOS runner — the web host has no platform-specific dependencies).

The workflow validates the full chain: workspace build → web host build (Next.js + Serwist) → packaging verification → tests. The `web/` directory is NOT an npm workspace, so its dependencies require a separate `npm --prefix web ci` install step.

## Steps

1. Create `.github/workflows/web.yml` with:
   - `name: Web` (or `Web CI`)
   - Triggers: `push` to `[main, feat/**]`, `pull_request` to `[main]` — same as ci.yml
   - Single job `build` on `ubuntu-latest`
2. Add the job steps in this order:
   - `actions/checkout@v6` with `fetch-depth: 0`
   - `actions/setup-node@v6` with `node-version: '22'` and `cache: 'npm'`
   - `npm ci` — install root workspace dependencies
   - `npm --prefix web ci` — install web host dependencies separately (web/ is not an npm workspace; node-pty compiles from source but ubuntu-latest has build-essential pre-installed)
   - `npm run build` — build all workspace packages + tsc
   - `npm run build:web-host` — runs `next build && serwist build` then stages standalone output
   - `npm run validate-pack` — verify tarball includes web standalone files (T01's extension)
   - `npm run test:unit` — runs all unit tests including web contract tests
   - `npm run test:integration` — runs integration tests
3. Verify the YAML is syntactically valid with `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/web.yml','utf8'))"`.
4. Verify the workflow has the expected structure (triggers, runner, step count).

**Reference:** `.github/workflows/ci.yml` is the template — mirror its checkout/setup-node pattern and add the web-specific install and build steps.

## Must-Haves

- [ ] `.github/workflows/web.yml` exists
- [ ] Triggers: push to `main` and `feat/**`, PR to `main`
- [ ] Runs on `ubuntu-latest` only (D096)
- [ ] Includes `npm --prefix web ci` step for web dependencies
- [ ] Includes `npm run build:web-host` step after `npm run build`
- [ ] Includes `npm run validate-pack` step
- [ ] Includes `npm run test:unit` and `npm run test:integration` steps
- [ ] YAML syntax is valid

## Verification

- `test -f .github/workflows/web.yml` — file exists
- `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/web.yml','utf8'))"` — YAML parses without error
- Inspect the file to confirm triggers, runner, and step ordering match the specification

## Inputs

- `.github/workflows/ci.yml` — template for workflow structure, action versions, Node setup
- T01 output — `validate-pack.js` now checks web files, so the `npm run validate-pack` step in this workflow will exercise those checks

## Expected Output

- `.github/workflows/web.yml` — new GitHub Actions workflow file with the full web host CI pipeline

## Observability Impact

- **New CI signal:** A `Web` workflow now appears in the GitHub Actions tab for pushes to `main`/`feat/**` and PRs to `main`. Each step (install, build, validate-pack, test) fails independently with inline logs.
- **Inspection:** View workflow runs at `Actions > Web` in the GitHub repo. Locally, validate the file with `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/web.yml'))"`.
- **Failure visibility:** `npm run build:web-host` failures show Next.js/Serwist build errors. `npm run validate-pack` failures list missing tarball entries with `MISSING:` prefix. Test failures show standard Jest/Vitest output.
- **No secrets or env vars:** The workflow uses no secrets — all steps run against public npm registry.
