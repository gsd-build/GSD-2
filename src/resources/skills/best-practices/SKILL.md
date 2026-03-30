---
name: best-practices
description: Apply modern web development best practices for security, compatibility, and code quality. Use when asked to "apply best practices", "security audit", "modernize code", "code quality review", or "check for vulnerabilities".
license: MIT
metadata:
  author: web-quality-skills
  version: "1.0"
---

# Best practices

Modern web development standards based on Lighthouse best practices audits. Covers security, browser compatibility, and code quality patterns.

## Security

### HTTPS everywhere

- ❌ `<img src="http://example.com/image.jpg">` — mixed content
- ✅ Use `https://` for all external resources
- HSTS: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

### Content Security Policy (CSP)

**CSP Header (recommended over meta tag):**
```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-abc123' https://trusted.com;
  style-src 'self' 'nonce-abc123';
  img-src 'self' data: https:;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'self'; base-uri 'self'; form-action 'self';
```

Use nonces for inline scripts: `<script nonce="abc123">...</script>`

### Security headers

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

### No vulnerable libraries

```bash
npm audit                    # Check vulnerabilities
npm audit fix                # Auto-fix when possible
```

**Vulnerable patterns to avoid:**
- ❌ `Object.assign(target, userInput)` / `_.merge(target, userInput)` — prototype pollution
- ✅ `JSON.parse(JSON.stringify(userInput))` — safe deep clone

### Input sanitization

- ❌ `element.innerHTML = userInput` / `document.write(userInput)` — XSS
- ✅ `element.textContent = userInput` — safe text
- ✅ If HTML needed: `element.innerHTML = DOMPurify.sanitize(userInput)`

### Secure cookies

- ❌ `document.cookie = "session=abc123"` — insecure
- ✅ `Set-Cookie: session=abc123; Secure; HttpOnly; SameSite=Strict; Path=/`

---

## Browser compatibility

### Doctype & charset

- ❌ Missing/legacy doctype — ✅ `<!DOCTYPE html><html lang="en">`
- ❌ Charset after title — ✅ `<meta charset="UTF-8">` as first element in `<head>`
- ✅ `<meta name="viewport" content="width=device-width, initial-scale=1">`

### Feature detection

```javascript
// ❌ Browser detection: navigator.userAgent.includes('Chrome')
// ✅ Feature detection:
if ('IntersectionObserver' in window) { /* use it */ } else { /* fallback */ }
```
```css
/* ✅ CSS feature detection */
@supports (display: grid) { .container { display: grid; } }
```

---

## Deprecated APIs

- ❌ `document.write()` — blocks parsing. ✅ `document.head.appendChild(script)`
- ❌ Synchronous XHR `xhr.open('GET', url, false)` — ✅ `await fetch(url)`
- ❌ Application Cache `<html manifest>` — ✅ Service Workers

### Event listener passive

- ❌ `addEventListener('touchstart', handler)` — may block scrolling
- ✅ `addEventListener('touchstart', handler, { passive: true })`
- If `preventDefault` needed: `{ passive: false }` explicitly

---

## Console & errors

### Proper error handling

```javascript
// ✅ Catch and report
try { riskyOperation(); }
catch (error) { errorTracker.captureException(error); showErrorMessage('Something went wrong.'); }
```

**React error boundaries:** Use `getDerivedStateFromError` + `componentDidCatch` to catch render errors and show fallback UI.

**Global handlers:**
```javascript
window.addEventListener('error', (e) => errorTracker.captureException(e.error));
window.addEventListener('unhandledrejection', (e) => errorTracker.captureException(e.reason));
```

---

## Source maps

- ❌ `devtool: 'source-map'` in production — exposes source code
- ✅ `devtool: 'hidden-source-map'` — uploaded to error tracker only
- ✅ `devtool: process.env.NODE_ENV === 'production' ? false : 'source-map'`

---

## Performance best practices

### Avoid blocking patterns

- ❌ `<script src="heavy.js">` — ✅ `<script defer src="heavy.js">`
- ❌ `@import url('other.css')` — ✅ `<link rel="stylesheet" href="other.css">` (parallel)

### Efficient event handlers

```javascript
// ❌ Handler on every element — ✅ Event delegation:
container.addEventListener('click', (e) => { if (e.target.matches('.item')) handleClick(e); });
```

### Memory management

- ❌ Adding listener without cleanup — memory leak
- ✅ `removeEventListener` on unmount
- ✅ `AbortController`: `addEventListener('resize', handler, { signal: controller.signal })` then `controller.abort()`

---

## Code quality

### Valid & semantic HTML

- ❌ Duplicate IDs, invalid nesting (`<a><button>`), `<ul><div>` — ✅ Unique IDs, proper nesting
- ❌ `<div class="header"><div class="nav">` — ✅ `<header><nav><a>` semantic elements

### Image aspect ratios

- ❌ Wrong width/height distorts images
- ✅ Set correct `width`/`height` matching actual ratio, or `object-fit: cover`

---

## Permissions & privacy

- ❌ Request permissions on page load (often denied)
- ✅ Request after user action with explanation
- Restrict features: `Permissions-Policy: geolocation=(), camera=(), microphone=()`

---

## Audit checklist

### Security (critical)
- [ ] HTTPS enabled, no mixed content
- [ ] No vulnerable dependencies (`npm audit`)
- [ ] CSP headers configured
- [ ] Security headers present
- [ ] No exposed source maps

### Compatibility
- [ ] Valid HTML5 doctype
- [ ] Charset declared first in head
- [ ] Viewport meta tag present
- [ ] No deprecated APIs used
- [ ] Passive event listeners for scroll/touch

### Code quality
- [ ] No console errors
- [ ] Valid HTML (no duplicate IDs)
- [ ] Semantic HTML elements used
- [ ] Proper error handling
- [ ] Memory cleanup in components

### UX
- [ ] No intrusive interstitials
- [ ] Permission requests in context
- [ ] Clear error messages
- [ ] Appropriate image aspect ratios

## Tools

| Tool | Purpose |
|------|---------|
| `npm audit` | Dependency vulnerabilities |
| [SecurityHeaders.com](https://securityheaders.com) | Header analysis |
| [W3C Validator](https://validator.w3.org) | HTML validation |
| Lighthouse | Best practices audit |
| [Observatory](https://observatory.mozilla.org) | Security scan |

## References

- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Web Quality Audit](../web-quality-audit/SKILL.md)
