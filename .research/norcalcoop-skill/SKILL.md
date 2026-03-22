---
name: gsd-uat-browser
description: "Automated browser execution of GSD UAT test items using portless and agent-browser. Reads a GSD {phase}-UAT.md file, translates each human test item into a browser sequence, executes it headlessly, and reports what passed and what failed. Also supports --discover mode: crawl the codebase to design user journey e2e tests without a pre-written UAT file. Use when running UAT, executing browser tests, verifying features end-to-end, or when the user says --discover, find journeys, or wants to build a persistent e2e test suite. Zero modifications to GSD required."
compatibility: "Requires portless (npm install -g portless), agent-browser (npm install -g agent-browser), Python 3.x"
---

# GSD UAT Browser Automation Skill

## Mode Selection

**Default (UAT mode):** The user provides a UAT.md checklist path. Translate each item
into a browser test and run it. Output lives next to the UAT file.

**Discovery mode** (`--discover`, "discover", "find journeys", "design e2e tests"):
No UAT file — crawl the codebase, design user journeys, write a persistent e2e spec.
See [resources/discover-guide.md](resources/discover-guide.md).

Detect the mode from the user's prompt first. Everything below the "Auth Discovery"
section applies to both modes.

---

## Prerequisites

```bash
npm install -g portless
npm install -g agent-browser
agent-browser install        # downloads Chromium (~170MB, one-time)
```

The dev script must be portless-wrapped so the app has a stable named URL:

```bash
# package.json scripts:
"dev:client": "portless myapp sh -c 'npx vite --port $PORT --host $HOST'"
```

---

## Check: Tools Installed

**Phase 1 — CLIs on PATH:**

```bash
which portless 2>/dev/null && echo "portless OK" || echo "portless MISSING"
which agent-browser 2>/dev/null && echo "agent-browser OK" || echo "agent-browser MISSING"
```

**Phase 2 — Chromium downloaded** (only if agent-browser CLI is present):

```bash
python3 -c "
import os, glob
paths = [
    os.path.expanduser('~/Library/Caches/ms-playwright/chromium-*'),  # macOS
    os.path.expanduser('~/.cache/ms-playwright/chromium-*'),           # Linux
]
found = any(glob.glob(p) for p in paths)
print('chromium OK' if found else 'chromium MISSING')
"
```

**Stop messages by failure mode:**

If portless CLI is missing:
> "**portless** is not installed. It gives each dev server a stable named `.localhost`
> URL so the browser always finds the right app.
> ```bash
> npm install -g portless
> ```
> Would you like me to run this now?"

If agent-browser CLI is missing:
> "**agent-browser** is not installed. It's the headless browser CLI used to run the tests.
> ```bash
> npm install -g agent-browser
> agent-browser install    # downloads Chromium (~170MB, one-time)
> ```
> Would you like me to run these now?"

If agent-browser CLI is present but Chromium is missing:
> "**agent-browser** is installed but Chromium hasn't been downloaded yet.
> ```bash
> agent-browser install    # downloads Chromium (~170MB, one-time)
> ```
> Would you like me to run this now?"

If both are missing, combine into one message. If user says yes, run the missing steps then
re-check. If no, stop.

**Once you output a stop message, halt completely.** Do not read package.json, check portless
state, or take any other action until the user responds.

---

## Auth Discovery

Run this check in **both modes**, after confirming portless is running but before
generating any YAML or designing any journeys.

**Step 1 — Check for existing config:**

```bash
python3 -c "
import json, os
p = 'e2e/e2e-config.json'
print('CONFIG_FOUND:' + open(p).read().strip() if os.path.exists(p) else 'NO_CONFIG')
"
```

If `CONFIG_FOUND` — load the `auth.email` and `auth.password` values silently.
Skip to generating the spec. Do not ask the user for credentials.

**Step 2 — Determine if auth is needed:**

In **UAT mode**: scan the parsed UAT items for keywords suggesting protected pages
(`dashboard`, `profile`, `account`, `my `, `logged in`, `signed in`, `authenticated`).
Then read the router file (e.g. `src/router.ts`, `client/src/router.ts`, `src/app/**`) to
confirm whether those pages have `requiresAuth: true` or an equivalent guard.

In **discovery mode**: the route/auth exploration step in `resources/discover-guide.md`
handles detection — no separate scan needed.

**Step 3 — If auth needed and no config:**

**Full stop. Do not generate any YAML. Do not translate any test items. Do not proceed
with discovery. Nothing happens until you have credentials.** Ask:

> "I found pages that require authentication (`{list protected routes}`).
> To run these tests I'll need test credentials.
>
> What email and password should I use? I'll save them to `e2e/e2e-config.json`
> so you don't have to enter them again."

Wait for the user's reply. There is no default. There is no bypass. There are no
"typical test credentials" to fall back on — using guessed credentials would silently
produce a spec that fails every auth test.

When the user provides credentials, write `e2e/e2e-config.json` using
`assets/e2e-config-template.json` as the structure, substituting the provided email and password.

Also add to `.gitignore` if not already present:
```
e2e/e2e-config.json
e2e/uat-auth-session.json
```

Then resume from where you stopped: proceed to YAML generation using those credentials.

**Step 4 — If no auth detected:**

Proceed without credentials. Tests needing auth state will be skipped or omitted.

---

## UAT Mode (default)

### Reading the UAT File

Parse the UAT file provided (e.g. `.planning/phases/{phase}/{phase}-UAT.md` for GSD
projects). Extract every discrete test item as a plain-language string — numbered lists,
checkbox lists, table rows, or section-header items. Each item becomes one browser test.

### Translating Test Items to YAML Spec Entries

For each item: classify the type, cross-reference source files for exact URLs/labels/button
text, then write a YAML spec entry.

See [resources/translation-guide.md](resources/translation-guide.md) for:
- Classification table (auth flow, content check, navigation, API check, etc.)
- Selector rules (semantic locators vs CSS — critical)
- Test data conventions
- Error recovery patterns

See [resources/worked-examples.md](resources/worked-examples.md) for complete YAML
examples of common UAT item types.

### Execution

#### Step 0: Confirm portless is configured and running

**If the user provided an explicit URL** (e.g. `http://torchsecret.localhost:1355`):
Extract the hostname segment before `.localhost` — that is the portless name. Skip step 1.

**1. Find the configured portless name**

```bash
python3 ~/.claude/skills/gsd-uat-browser/scripts/check-portless-config.py
```

If **FOUND** — proceed to step 2.

If **NOT_FOUND** — stop:
> "This project's package.json doesn't include a portless name in any dev script.
> To use browser UAT, wrap your **{script-name}** script with portless:
>   `"{script-name}": "portless {suggested-name} {current-cmd}"`
> Then start the dev server: `npm run {script-name}` (or `pnpm run` / `bun run` for your package manager)"

**2. Check if the service is running**

```bash
python3 ~/.claude/skills/gsd-uat-browser/scripts/check-portless-running.py {portless-name}
# e.g. python3 ~/.claude/skills/gsd-uat-browser/scripts/check-portless-running.py myapp
```

If **RUNNING** — proceed using `http://{name}.localhost:1355`.

If **NOT_RUNNING** — stop:
> "The dev server for `{name}` is not currently running.
> Start it with: `npm run {script-name}` (or `pnpm run` / `bun run`) then re-run UAT."

Do not start the server. **For monorepos** — check all services first, list all missing in one message.

#### Auth State Ordering

Use the credentials from `e2e/e2e-config.json` (loaded in Auth Discovery) when
generating login/register steps. Auth session is saved to `e2e/uat-auth-session.json`.

1. No auth, don't create it (public pages, API checks)
2. Creates auth state (login, register) — `state save e2e/uat-auth-session.json` as last step
3. Requires auth (protected pages) — `state load e2e/uat-auth-session.json` as first step
4. Destroys auth (logout) — always last

#### Generate and Run

Write the YAML spec — see [resources/yaml-spec-format.md](resources/yaml-spec-format.md).

```bash
pip install pyyaml   # once if not installed
python3 ~/.claude/skills/gsd-uat-browser/scripts/uat-runner.py {spec-path}
# e.g. python3 ~/.claude/skills/gsd-uat-browser/scripts/uat-runner.py .planning/phases/31-rebrand-tech-debt/31-UAT-TESTS.yaml
```

Exits 0 on all-pass, 1 on any failure. Auto-writes `{spec-dir}/{stem}-BROWSER.md` (next to the spec file).

---

## Discovery Mode (`--discover`)

See [resources/discover-guide.md](resources/discover-guide.md) for the full workflow.

**Summary:**
1. Check prerequisites and portless (same as UAT mode)
2. Run auth discovery (same as UAT mode)
3. Explore codebase in parallel — routes, auth pages, features, API surface
4. Design 3–7 user journeys covering happy paths and key error scenarios
5. Write spec to `e2e/journeys-TESTS.yaml`
6. If spec already exists, ask: "Overwrite, or save as `journeys-v{N}-TESTS.yaml`?"
7. Offer to run

Output goes to `e2e/` (not `.planning/` — these are persistent e2e tests, not per-phase UAT):
- `e2e/journeys-TESTS.yaml` — the spec
- `e2e/journeys-BROWSER.md` — the report
- `e2e/uat-failures/` — screenshots

---

## What To Skip

Don't generate browser tests for:
- **Pure backend**: database migrations, cron jobs
- **Already checked by GSD**: TypeScript compilation, unit tests
- **Infrastructure**: environment variables
- **Duplicates**: merge identical flows into one test

Note skipped items in the output with the reason.

---

## Output

The runner writes `{spec-dir}/{stem}-BROWSER.md` automatically (next to the spec file).
Read it and relay the summary to the user. For any failures, include the diagnosis and screenshot path.

---

## Cleanup

```bash
agent-browser close
```

The auth session file `e2e/uat-auth-session.json` is intentionally left in place —
reused on the next UAT run. Add to `.gitignore`:

```
e2e/e2e-config.json
e2e/uat-auth-session.json
e2e/uat-failures/
.planning/uat-auth-session.json
.planning/uat-failures/
```
