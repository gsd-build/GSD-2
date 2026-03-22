# Discovery Mode Guide

## Contents

- [Trigger Phrases](#trigger-phrases)
- [Codebase Exploration](#codebase-exploration)
- [Auth Discovery](#auth-discovery-shared-with-uat-mode)
- [Journey Design](#journey-design)
- [Auth Session Lifecycle in Journeys](#auth-session-lifecycle-in-journeys)
- [Output](#output)

---

## Trigger Phrases

Activate discovery mode when the user says any of:
`--discover`, `discover`, `find journeys`, `design e2e tests`, `discover e2e`,
`build e2e tests`, `generate user journeys`, `create journey tests`

---

## Codebase Exploration

Read these files to understand the app — do it in parallel across four areas:

### 1. Routes
Look for all of:
- `src/router.ts`, `client/src/router.ts`
- `src/app/**/page.tsx` (Next.js App Router)
- `pages/**/*.tsx` / `pages/**/*.ts` (Next.js Pages Router)
- `src/pages/**/*.ts`, `src/pages/**/*.tsx`
- `src/routes/**`

Extract for each route:
- Path (e.g. `/dashboard`)
- Display name / page title
- `requiresAuth` or equivalent guard flag
- `noindex` flag

### 2. Auth
Look for:
- Login page: search for files matching `*login*`, `*signin*`, `*sign-in*`
- Register page: files matching `*register*`, `*signup*`, `*sign-up*`
- Auth middleware: `middleware/require-auth*`, `middleware/auth*`, route guards in router files
- Protected routes: any route with `requiresAuth: true` or equivalent

For each auth page, read it and extract:
- Form field labels (exact text — the `<label>` content)
- Submit button text (exact `<button>` text or `aria-label`)
- Success destination (where users land after login/register)
- Error message text (what renders on failure)

### 3. Features
Look for the app's main value proposition:
- What entities does it create? (secrets, posts, documents, items...)
- Key create/edit/delete flows
- Main forms and their fields
- Dashboard or list pages

Read 2-3 key page files to understand the core feature.

### 4. API Surface (optional — read if server routes are accessible)
Look for: `server/src/routes/**`, `src/app/api/**`, `pages/api/**`

Identify key endpoints that will be exercised by the journeys.

---

## Auth Discovery (shared with UAT mode)

Before designing journeys:

**1. Check for existing config:**
```bash
python3 -c "
import json, os
p = 'e2e/e2e-config.json'
print('CONFIG_FOUND:' + open(p).read().strip() if os.path.exists(p) else 'NO_CONFIG')
"
```

**2. Determine if auth is needed** from the route exploration:
- Did you find login/register pages?
- Are there routes with `requiresAuth: true` or equivalent?

**3a. If config found** — silently load credentials. Continue.

**3b. If auth needed but no config** — stop and ask:
> "I found authenticated routes (`{list protected routes}`). To include login and dashboard journeys I'll need test credentials.
>
> What email and password should I use? I'll save them to `e2e/e2e-config.json` so you don't have to enter them again."

When the user provides credentials, write `e2e/e2e-config.json` using
`assets/e2e-config-template.json` as the structure, substituting the provided email and password.
Add to `.gitignore` if not present:
```
e2e/e2e-config.json
e2e/uat-auth-session.json
```

**3c. If no auth found** — skip auth-dependent journeys entirely. Proceed.

---

## Journey Design

### Journey types — include in order shown

| # | Journey | Include when |
|---|---------|-------------|
| 1 | **Public navigation** — visit every public (non-auth) page, verify title and key content | Always |
| 2 | **Auth guard** — try accessing each protected page without a session, expect redirect to login | Protected routes found |
| 3 | **Registration** — complete the register form → land on success destination → save session | Register page found |
| 4 | **Login** — sign in with config credentials → reach dashboard → save session | Login page found |
| 5 | **Core feature** — load saved session → do the main thing the app does | Main feature found |
| 6 | **Error paths** — submit key forms with bad data, expect validation messages | Key forms found |
| 7 | **Logout** — load session → sign out → confirm session cleared | Login journey included |

Design 3–7 journeys. It's better to have fewer high-quality journeys than many shallow ones.

### Principles

- **Tell a story.** Each journey has a clear user goal: "New user creates their first item."
  Not: "Visit /register, fill form, check URL."
- **Compose public pages into one navigation journey.** Don't create separate 1-page journeys for
  home, about, and terms — that's UAT mode. Instead, write one journey: "Visitor explores the site"
  that navigates from the home page through several public pages in a single test (open / → verify
  wordmark → open /about → verify heading → open /terms → verify content). This captures the
  browsing experience, not just "does each page load."
- **Don't repeat page visits.** If the login journey visits `/dashboard`, the core feature
  journey shouldn't also start there fresh — it should load the saved session and continue.
- **Sequence matters.** Journeys that create auth state come before journeys that consume it.
  Logout always last.
- **Use exact values from source.** Button text, labels, error messages — read from source files,
  never guess. A test that guesses `"Submit"` when the button says `"Create account"` fails silently.
- **Multi-step means 3+ agent steps.** A journey should have at least 3 agent steps (open, interact,
  verify). Single-page checks with just open + assert belong in UAT mode, not discovery journeys.

### Journey naming

Use user-goal phrasing, not technical names:
- ✅ `"New user registers and reaches dashboard"`
- ✅ `"Returning user signs in and views their dashboard"`
- ✅ `"User creates a new item and sees it in the list"`
- ❌ `"Registration flow"`
- ❌ `"POST /api/auth/register"`

---

## Auth Session Lifecycle in Journeys

```
Journey 3 (Register):   ... → state save e2e/uat-auth-session.json
Journey 4 (Login):      state load e2e/uat-auth-session.json (if register ran) OR
                        open /login → fill creds → save session
Journey 5 (Core):       state load e2e/uat-auth-session.json → do the feature
Journey 7 (Logout):     state load e2e/uat-auth-session.json → click sign out → verify /login
```

If only login (no register) is in the app, Journey 4 creates the session.
If only register is found, Journey 3 creates it.

---

## Output

### File location

Write spec to `e2e/journeys-TESTS.yaml` (relative to project root).
This is different from UAT mode which writes next to the UAT file.
The `e2e/` directory is for persistent cross-version e2e tests, not per-phase UAT.

Create the directory if it doesn't exist.

### Re-discovery

If `e2e/journeys-TESTS.yaml` already exists:
> "A journey spec already exists at `e2e/journeys-TESTS.yaml`. Overwrite it, or save this as `journeys-v2-TESTS.yaml`?"

Wait for the user's choice before writing.

### Spec top-level fields

```yaml
suite: e2e-journeys      # replaces 'phase' for discovery mode
app: http://myapp.localhost:1355
failures_dir: e2e/uat-failures

tests:
  - ...
```

The runner treats `suite` like `phase` — it's used in the report heading.
If the runner doesn't yet support `suite`, use `phase: e2e-journeys` as a fallback.

### After writing

Show a summary:
```
Journeys written to e2e/journeys-TESTS.yaml:
  1. Public site exploration (3 steps)
  2. Auth guard — protected pages redirect (2 steps)
  3. New user registers and reaches dashboard (5 steps)
  4. Returning user signs in and views dashboard (4 steps)
  5. User signs out (3 steps)

Run now? python3 ~/.claude/skills/gsd-uat-browser/scripts/uat-runner.py e2e/journeys-TESTS.yaml
```

---

