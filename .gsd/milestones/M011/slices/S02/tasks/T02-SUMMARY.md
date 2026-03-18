---
id: T02
parent: S02
milestone: M011
provides:
  - .github/workflows/web.yml — dedicated CI workflow for web host build chain
key_files:
  - .github/workflows/web.yml
key_decisions:
  - none
patterns_established:
  - Separate CI workflow per build chain (web.yml alongside ci.yml) for independent failure reporting
observability_surfaces:
  - GitHub Actions "Web" workflow in Actions tab — separate check per push/PR
  - Each step (install, build, validate-pack, test) fails independently with inline logs
  - npm run validate-pack prints OK/MISSING per file; npm run build:web-host shows Next.js/Serwist errors
duration: 20m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T02: Create web.yml GitHub Actions workflow

**Created .github/workflows/web.yml with full web host CI pipeline: checkout, Node 22 setup, root + web dependency install, workspace build, web host build, tarball validation, and unit/integration tests on ubuntu-latest.**

## What Happened

Created `.github/workflows/web.yml` as a dedicated CI workflow for the web host build chain (R132). The workflow mirrors `ci.yml`'s checkout and Node setup pattern but adds web-specific steps: `npm --prefix web ci` for the non-workspace web directory, `npm run build:web-host` for the Next.js + Serwist build, and `npm run validate-pack` to verify the tarball includes web standalone output. Per D092, this is separate from `ci.yml` for independent failure reporting. Per D096, it runs on `ubuntu-latest` only.

Triggers match `ci.yml`: push to `main` and `feat/**`, pull_request to `main`. Single `build` job with 9 steps in correct dependency order.

## Verification

- `test -f .github/workflows/web.yml` — file exists ✅
- YAML syntax validates via Python yaml.safe_load ✅
- Structural validation confirms all 11 checks pass: push triggers (main, feat/**), PR trigger (main), ubuntu-latest runner, and all 7 required npm run commands present ✅
- Step ordering verified: build → build:web-host → validate-pack → test:unit → test:integration ✅
- `npm run validate-pack` exits 0 — confirms T01's web file checks pass against the tarball ✅
- `grep -q 'dist/web/standalone/server.js' scripts/validate-pack.js` — confirms T01's check present ✅

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `test -f .github/workflows/web.yml` | 0 | ✅ pass | <1s |
| 2 | `python3 -c "import yaml; yaml.safe_load(open('.gsd/worktrees/M011/.github/workflows/web.yml'))"` | 0 | ✅ pass | <1s |
| 3 | `python3 structural_validation (11 checks)` | 0 | ✅ pass | <1s |
| 4 | `npm run validate-pack` | 0 | ✅ pass | 25s |
| 5 | `grep -q 'dist/web/standalone/server.js' scripts/validate-pack.js` | 0 | ✅ pass | <1s |
| 6 | `node -e "require('js-yaml')..." (slice verification)` | 1 | ⚠️ skip | n/a |

Note: The slice-level `js-yaml` verification command cannot run because `js-yaml` is not a project dependency. The same structural checks were validated using Python's `yaml.safe_load`, which confirmed identical results (triggers, runner, job structure).

## Diagnostics

- **CI visibility:** The `Web` workflow appears as a separate check in GitHub Actions. View at `Actions > Web` in the repo.
- **Local validation:** Run `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/web.yml'))"` to check YAML syntax. `js-yaml` is not installed in this project.
- **Failure shapes:** Build step failures show npm stderr inline in the Actions log. `validate-pack` failures print `MISSING: <path>` for each absent file. Test failures show standard test runner output.

## Deviations

- Used Python `yaml.safe_load` instead of `js-yaml` for YAML validation because `js-yaml` is not a project dependency and is not installed anywhere in the workspace. The structural checks are equivalent.

## Known Issues

- The slice plan's verification command `node -e "const y = require('js-yaml')..."` will fail in any local environment because `js-yaml` is not listed in any `package.json` in the project. A Python equivalent or installing `js-yaml` as a devDependency would be needed for that specific check to work.

## Files Created/Modified

- `.github/workflows/web.yml` — new GitHub Actions workflow for web host CI pipeline
- `.gsd/milestones/M011/slices/S02/S02-PLAN.md` — added Observability / Diagnostics section (pre-flight fix)
- `.gsd/milestones/M011/slices/S02/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
