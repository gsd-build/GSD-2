# Test Item Translation Guide

## Contents

- [Classification Table](#classification-table)
- [Cross-Referencing Source Files](#cross-referencing-source-files)
- [Selector Rules — Critical](#selector-rules--critical)
- [Test Data](#test-data)
- [Theme and localStorage State](#theme-and-localstorage-state)
- [Error Recovery](#error-recovery)

---

## Classification Table

| Item pattern | Test type | Primary approach |
|---|---|---|
| "User can log in / sign in / authenticate" | Auth flow | `open` → fill label → click button → `wait --url` |
| "User can register / sign up" | Registration | `open` → fill labels → click button → `wait` |
| "Page shows / displays / contains [content]" | Content check | `open` → `eval_contains` on `document.body.innerText` |
| "User can navigate to / access [page]" | Navigation | `open` → `wait --load` → `url_contains` |
| "Form validates / shows error for [condition]" | Validation | `open` → submit incomplete → `text_present` |
| "[Feature] works / functions correctly" | Feature flow | read source files, derive steps |
| "API returns / responds with [result]" | API check | `open` → `eval fetch(...)` → assert response |
| "User is redirected to [destination]" | Redirect | trigger action → `url_contains` |
| "User can log out" | Session end | trigger logout → `url_contains /login` |
| "[Protected page] requires authentication" | Auth guard | `open` without session → `url_contains /login` |
| "[Page] has [HTTP header]" | Header check | `eval fetch("/path").then(r=>r.headers.get("header-name"))` |

> **Same-origin fetch reads all response headers.** `X-Robots-Tag`, `X-Frame-Options`,
> `Cache-Control` are fully accessible via fetch when same-origin. Don't skip these — test
> them with `eval_contains`. For SPAs that use client-side meta tags instead, check the DOM:
> `document.querySelector('meta[name="robots"]')?.content ?? 'NOT_FOUND'`

---

## Cross-Referencing Source Files

Before writing any YAML step, read the relevant source files to find:

- **App display name** — Read `package.json` `name` field as a starting point, but verify the
  actual display name in source: `src/pages/home.ts`, `index.html` `<title>`, router files,
  or layout components. The npm package slug (`my-app`) often differs from the display name
  (`My App`). For pnpm workspaces, check `pnpm-workspace.yaml` + the relevant sub-package's
  `package.json`. For Turborepo, check `turbo.json` + the app's own `package.json`.
- **Exact URL paths** — `src/app/**/page.tsx`, `pages/**`, `src/routes/**`, `client/src/router.ts`
- **Form field labels** — the actual `<label>` text, not a guess
- **Button text** — the actual `<button>` content or `aria-label`
- **Error message text** — what the app actually renders on failure
- **Redirect destinations** — where the app actually sends users

This is the difference between a test that works and a test that guesses.

---

## Selector Rules — Critical

Always use semantic locators or the snapshot→ref workflow. Never hardcode CSS selectors.

```yaml
# ✅ Correct — semantic, stable across refactors
steps:
  - find label "Email address" fill "test@example.com"
  - find role button click --name "Sign in"
  - find text "Submit" click

# ✅ Correct — snapshot→ref workflow
steps:
  - snapshot -i --json    # identify @e3 = email field, @e5 = submit button
  - fill @e3 "test@example.com"
  - click @e5

# ❌ Wrong — fragile, breaks on DOM changes
steps:
  - click "#email-input"
  - click ".btn.btn-primary"
```

Re-snapshot after any navigation. Refs are scoped to the snapshot that produced them.

---

## Test Data

```
Email:    gsd-uat-{timestamp}@example.com   (unique per run, avoids "already registered")
Password: GsdUat123!                         (meets most complexity requirements)
Text:     GSD UAT Test Value
Numbers:  42
```

---

## Theme and localStorage State

When a test requires a specific theme or localStorage state, use `setup_js` to set it before
the page loads rather than clicking UI controls. The `setup_js` value is eval'd before steps:

```yaml
- name: "Protection Panel in Light Mode"
  setup_js: "localStorage.setItem('theme', 'light')"
  steps:
    - open {app}/create
    - wait --load networkidle --timeout 10000
  assertions:
    - { type: eval_equals, js: "localStorage.getItem('theme')", expected: "light" }
```

This is more reliable than clicking theme toggles because toggle buttons cycle through
states and their aria-labels change with each click.

---

## Error Recovery

```bash
# Daemon crash
agent-browser close
# Retry test from start (max 1 retry)

# Page slow to load
agent-browser wait --load networkidle --timeout 30000

# Snapshot returns empty (page still rendering)
agent-browser wait 2000
agent-browser snapshot -i --json  # re-snapshot

# Element not found after snapshot
# Re-snapshot — refs are scoped to the snapshot that produced them
agent-browser snapshot -i --json
```
