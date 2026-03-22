# YAML Test Spec Format

## Contents

- [File Location](#file-location)
- [Top-Level Structure](#top-level-structure)
- [Auth Config Reference](#auth-config-reference)
- [Full Test Entry](#full-test-entry)
- [Assertion Types](#assertion-types)
- [Special Fields](#special-fields)
- [HTTP Header Checks](#http-header-checks)

---

## File Location

**UAT mode:** Write to the same directory as the UAT file, named `{stem}-TESTS.yaml`.
For GSD projects the UAT file lives in `.planning/phases/{phase}/`, so the spec goes there too.
Example: input `.planning/phases/31-rebrand-tech-debt/31-UAT.md` → output `.planning/phases/31-rebrand-tech-debt/31-UAT-TESTS.yaml`

**Discovery mode:** Write to `e2e/journeys-TESTS.yaml` (project root `e2e/` directory, not `.planning/`).
These are persistent cross-version tests, not tied to a specific phase.

## Top-Level Structure

```yaml
phase: 05-feature-polish             # UAT mode: matches the phase directory name
# OR for discovery mode:
phase: e2e-journeys                  # discovery mode: use this literal value
app: http://myapp.localhost:1355     # portless URL
failures_dir: .planning/uat-failures # UAT mode screenshot destination
# OR for discovery mode:
failures_dir: e2e/uat-failures       # discovery mode screenshot destination

tests:
  - name: "..."
    steps: [...]
    assertions: [...]
```

## Auth Config Reference

`e2e/e2e-config.json` — credentials loaded during Auth Discovery (both modes):
```json
{
  "auth": {
    "strategy": "credentials",
    "email": "test@example.com",
    "password": "TestPass123!"
  }
}
```
Add to `.gitignore`: `e2e/e2e-config.json` and `e2e/uat-auth-session.json`.

## Full Test Entry

```yaml
tests:
  - name: "Site Title and Header Wordmark"
    steps:
      - open {app}/
      - wait --load networkidle --timeout 10000
    assertions:
      # expected value cross-referenced from package.json "name" field and src/pages/home.ts
      # e.g. package name "torch-secret" → display name "Torch Secret" confirmed in router.ts
      - { type: eval_contains, js: "document.title", expected: "Torch Secret" }
      - { type: eval_contains, js: "document.querySelector('#wordmark')?.textContent ?? 'NOT_FOUND'", expected: "Torch Secret" }

  - name: "Login Flow"
    steps:
      - open {app}/login
      - wait --load networkidle --timeout 10000
      - find label "Email" fill "gsd-uat-1234@example.com"
      - find label "Password" fill "GsdUat123!"
      - find role button click --name "Sign in"
      - wait --load networkidle --timeout 10000
      - state save .planning/uat-auth-session.json
    assertions:
      - { type: url_contains, expected: "/dashboard" }

  - name: "Dashboard Requires Auth"
    steps:
      - close
      - open {app}/dashboard
      - wait --load networkidle --timeout 10000
    assertions:
      - { type: url_contains, expected: "/login" }

  - name: "Meta Robots on /privacy"
    steps:
      - open {app}/privacy
      - wait --load networkidle --timeout 10000
    assertions:
      - { type: eval_contains, js: "document.querySelector('meta[name=\"robots\"]')?.content ?? 'NOT_FOUND'", expected: "noindex" }
```

## Assertion Types

| Type | Checks |
|------|--------|
| `eval_contains` | JS eval result **contains** expected string |
| `eval_not_contains` | JS eval result does **not** contain expected string |
| `eval_equals` | JS eval result exactly equals expected string |
| `url_contains` | Current page URL contains expected string |
| `text_present` | Visible page text contains expected (uses `wait --text`) |
| `snapshot_contains` | Accessibility snapshot text contains expected |

## Special Fields

**`setup_js`** (optional string on a test): JS eval'd before steps — for localStorage,
feature flags, or clearing state. Failures do not abort the test.

**`{app}`** in steps: replaced with the `app` URL at runtime.

**State save/load**: `state save .planning/uat-auth-session.json` as last step of a login
test; `state load .planning/uat-auth-session.json` as first step of any test requiring auth.

## HTTP Header Checks

For server-set response headers, use same-origin fetch:

```yaml
assertions:
  - type: eval_contains
    js: "fetch('/privacy',{method:'HEAD'}).then(r=>r.headers.get('x-robots-tag')??'MISSING')"
    expected: "noindex"
```

For SPAs that use client-side meta tags instead, check the DOM:

```yaml
assertions:
  - { type: eval_contains, js: "document.querySelector('meta[name=\"robots\"]')?.content ?? 'NOT_FOUND'", expected: "noindex" }
```

Use both when the implementation is uncertain — whichever assertion passes is correct.
