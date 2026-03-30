---
name: accessibility
description: Audit and improve web accessibility following WCAG 2.1 guidelines. Use when asked to "improve accessibility", "a11y audit", "WCAG compliance", "screen reader support", "keyboard navigation", or "make accessible".
license: MIT
metadata:
  author: web-quality-skills
  version: "1.0"
---

# Accessibility (a11y)

Comprehensive accessibility guidelines based on WCAG 2.1 and Lighthouse accessibility audits. Goal: make content usable by everyone, including people with disabilities.

## WCAG Principles: POUR

| Principle | Description |
|-----------|-------------|
| **P**erceivable | Content can be perceived through different senses |
| **O**perable | Interface can be operated by all users |
| **U**nderstandable | Content and interface are understandable |
| **R**obust | Content works with assistive technologies |

## Conformance levels

| Level | Requirement | Target |
|-------|-------------|--------|
| **A** | Minimum accessibility | Must pass |
| **AA** | Standard compliance | Should pass (legal requirement in many jurisdictions) |
| **AAA** | Enhanced accessibility | Nice to have |

---

## Perceivable

### Text alternatives (1.1)

**Images require alt text:**
- ❌ `<img src="chart.png">` — missing alt
- ✅ `<img src="chart.png" alt="Bar chart showing 40% increase in Q3 sales">`
- ✅ `<img src="decorative-border.png" alt="" role="presentation">` — decorative image
- ✅ Complex images: use `<figure>` with `aria-describedby` pointing to `<figcaption>`

**Icon buttons need accessible names:**
- ❌ `<button><svg><!-- icon --></svg></button>` — no accessible name
- ✅ `<button aria-label="Open menu"><svg aria-hidden="true">...</svg></button>`
- ✅ Alternative: `<span class="visually-hidden">Open menu</span>` inside button

**Visually hidden class:**
```css
.visually-hidden {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}
```

### Color contrast (1.4.3, 1.4.6)

| Text Size | AA minimum | AAA enhanced |
|-----------|------------|--------------|
| Normal text (< 18px / < 14px bold) | 4.5:1 | 7:1 |
| Large text (≥ 18px / ≥ 14px bold) | 3:1 | 4.5:1 |
| UI components & graphics | 3:1 | 3:1 |

- ❌ `color: #999; background: #fff;` — contrast 2.5:1
- ✅ `color: #333; background: #fff;` — contrast 7:1
- ✅ Focus states: `:focus-visible { outline: 2px solid #005fcc; outline-offset: 2px; }`

**Don't rely on color alone:** Use color + icon + text for errors. Mark fields with `aria-invalid="true"` and `aria-describedby` linking to error message.

### Media alternatives (1.2)

- Video: include `<track kind="captions">` and `<track kind="descriptions">`
- Audio: provide a transcript (e.g., in a `<details>` element)

---

## Operable

### Keyboard accessible (2.1)

**All functionality must be keyboard accessible:**
```javascript
// ❌ Only click handler — ✅ Add keydown for Enter/Space
element.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleAction(); }
});
```

**Modal focus management:** Query all focusable elements, trap Tab/Shift+Tab between first/last, close on Escape, focus first element on open.

### Focus visible (2.4.7)

- ❌ `*:focus { outline: none; }` — never remove focus outlines globally
- ✅ Use `:focus-visible` for keyboard-only focus styles
- ✅ `button:focus-visible { box-shadow: 0 0 0 3px rgba(0,95,204,0.5); }`

### Skip links (2.4.1)

Add `<a href="#main-content" class="skip-link">Skip to main content</a>` before nav. Style off-screen, show on `:focus`.

### Motion (2.3)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important; scroll-behavior: auto !important;
  }
}
```

---

## Understandable

### Page language (3.1.1)

- ❌ `<html>` — no language
- ✅ `<html lang="en">` — language changes: `<span lang="fr">bonjour</span>`

### Consistent navigation (3.2.3)

Navigation should be consistent across pages. Use `<nav aria-label="Main">` with `aria-current="page"` on active link.

### Form labels (3.3.2)

- ❌ `<input type="email" placeholder="Email">` — no label
- ✅ `<label for="email">Email</label><input type="email" id="email" autocomplete="email" required>`
- ✅ Link instructions via `aria-describedby` to requirement text

### Error handling (3.3.1, 3.3.3)

- Announce errors: `<input aria-invalid="true" aria-describedby="email-error">` + `<p id="email-error" role="alert">...</p>`
- On submit: focus first `[aria-invalid="true"]` element, announce error summary count

---

## Robust

### Valid HTML (4.1.1)

- ❌ Duplicate IDs, `<a href="/"><button>Click</button></a>` (invalid nesting)
- ✅ Unique IDs, proper element nesting

### ARIA usage (4.1.2)

**Prefer native elements:**
- ❌ `<div role="button" tabindex="0">` — ✅ `<button>Click me</button>`
- ❌ `<div role="checkbox">` — ✅ `<label><input type="checkbox"> Option</label>`

**When ARIA is needed (e.g., custom tabs):**
Use `role="tablist"`, `role="tab"` with `aria-selected`/`aria-controls`, `role="tabpanel"` with `aria-labelledby`, and `tabindex="-1"` on inactive tabs.

### Live regions (4.1.3)

- Status: `<div aria-live="polite" aria-atomic="true">` — polite updates
- Alerts: `<div role="alert" aria-live="assertive">` — urgent interruptions
- Dynamic updates: clear textContent, then set in `requestAnimationFrame`

---

## Testing checklist

### Automated testing
```bash
npx lighthouse https://example.com --only-categories=accessibility
npx @axe-core/cli https://example.com
```

### Manual testing

- [ ] **Keyboard navigation:** Tab through entire page, use Enter/Space to activate
- [ ] **Screen reader:** Test with VoiceOver (Mac), NVDA (Windows), or TalkBack (Android)
- [ ] **Zoom:** Content usable at 200% zoom
- [ ] **High contrast:** Test with Windows High Contrast Mode
- [ ] **Reduced motion:** Test with `prefers-reduced-motion: reduce`
- [ ] **Focus order:** Logical and follows visual order

### Screen reader commands

| Action | VoiceOver (Mac) | NVDA (Windows) |
|--------|-----------------|----------------|
| Start/Stop | ⌘ + F5 | Ctrl + Alt + N |
| Next item | VO + → | ↓ |
| Previous item | VO + ← | ↑ |
| Activate | VO + Space | Enter |
| Headings list | VO + U, then arrows | H / Shift + H |
| Links list | VO + U | K / Shift + K |

---

## Common issues by impact

### Critical (fix immediately)
1. Missing form labels
2. Missing image alt text
3. Insufficient color contrast
4. Keyboard traps
5. No focus indicators

### Serious (fix before launch)
1. Missing page language
2. Missing heading structure
3. Non-descriptive link text
4. Auto-playing media
5. Missing skip links

### Moderate (fix soon)
1. Missing ARIA labels on icons
2. Inconsistent navigation
3. Missing error identification
4. Timing without controls
5. Missing landmark regions

## References

- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Deque axe Rules](https://dequeuniversity.com/rules/axe/)
- [Web Quality Audit](../web-quality-audit/SKILL.md)
