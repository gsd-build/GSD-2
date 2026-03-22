# Worked Examples

## Contents

- [Login with valid credentials](#user-can-log-in-with-valid-email-and-password)
- [Invalid credentials error](#invalid-credentials-show-an-error-message)
- [API endpoint check](#get-apiusers-returns-a-list-of-users)
- [Auth guard (dashboard)](#dashboard-is-only-accessible-to-logged-in-users)
- [Registration form validation](#registration-form-validates-required-fields)
- [Noindex meta tag (SPA)](#page-uses-noindex-meta-tag-spa--client-side)
- [X-Robots-Tag header (SSR)](#page-returns-x-robots-tag-header-ssr--server-set)

---

All examples show the YAML spec entry for each UAT item. Source files are read before
writing the spec — `js` assertions and step commands use exact selectors, text, and paths
found in the source, not guesses.

---

## "User can log in with valid email and password"

Source files read: `src/pages/login.tsx` (or `src/app/auth/login/page.tsx` for Next.js App Router)
→ label "Email address", button "Sign in", redirects to `/dashboard`

```yaml
- name: "User can log in with valid email and password"
  steps:
    - open {app}/login
    - wait --load networkidle --timeout 10000
    - find label "Email address" fill "gsd-uat-1234@example.com"
    - find label "Password" fill "GsdUat123!"
    - find role button click --name "Sign in"
    - wait --load networkidle --timeout 10000
    - state save .planning/uat-auth-session.json
  assertions:
    - { type: url_contains, expected: "/dashboard" }
```

---

## "Invalid credentials show an error message"

Source files read: `src/pages/login.tsx` → error state renders
"Invalid email or password"

```yaml
- name: "Invalid credentials show an error message"
  steps:
    - open {app}/login
    - wait --load networkidle --timeout 10000
    - find label "Email address" fill "wrong@example.com"
    - find label "Password" fill "wrongpassword"
    - find role button click --name "Sign in"
    - wait 2000
  assertions:
    - { type: text_present, expected: "Invalid email or password" }
    - { type: url_contains, expected: "/login" }
```

---

## "GET /api/users returns a list of users"

Source files read: `src/routes/users.ts` (or `src/app/api/users/route.ts` for Next.js)
→ path `/api/users`, returns `{users: [...]}`

```yaml
- name: "GET /api/users returns a list of users"
  steps:
    - open {app}/
    - wait --load networkidle --timeout 10000
  assertions:
    - type: eval_equals
      js: "fetch('/api/users').then(r=>String(r.status))"
      expected: "200"
    - type: eval_equals
      js: "fetch('/api/users').then(r=>r.json()).then(d=>String(Array.isArray(d.users)))"
      expected: "true"
```

---

## "Dashboard is only accessible to logged-in users"

```yaml
- name: "Dashboard is only accessible to logged-in users"
  steps:
    - close
    - open {app}/dashboard
    - wait --load networkidle --timeout 10000
  assertions:
    - { type: url_contains, expected: "/login" }
```

---

## "Registration form validates required fields"

Source files read: `src/pages/register.tsx` (or `src/app/register/page.tsx` for Next.js)
→ button "Create account", shows validation on empty submit

```yaml
- name: "Registration form validates required fields"
  steps:
    - open {app}/register
    - wait --load networkidle --timeout 10000
    - find role button click --name "Create account"
    - wait 2000
  assertions:
    - { type: snapshot_contains, expected: "required" }
    - { type: url_contains, expected: "/register" }
```

---

## "Page uses noindex meta tag" (SPA — client-side)

SPAs typically set meta tags client-side via the router after navigation. Check the DOM:

```yaml
- name: "Noindex Meta on /privacy"
  steps:
    - open {app}/privacy
    - wait --load networkidle --timeout 10000
  assertions:
    - { type: eval_contains, js: "document.querySelector('meta[name=\"robots\"]')?.content ?? 'NOT_FOUND'", expected: "noindex" }
```

---

## "Page returns X-Robots-Tag header" (SSR — server-set)

Server-set headers are readable via same-origin fetch:

```yaml
- name: "X-Robots-Tag Header on /privacy"
  steps:
    - open {app}/privacy
    - wait --load networkidle --timeout 10000
  assertions:
    - type: eval_contains
      js: "fetch('/privacy',{method:'HEAD'}).then(r=>r.headers.get('x-robots-tag')??'MISSING')"
      expected: "noindex"
```
