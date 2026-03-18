---
title: Use ::first-line for Typographic Treatments
impact: LOW
tags: pseudo, first-line, typography
---

## Use ::first-line for Typographic Treatments

Use ::first-line for drop-cap-adjacent styling without JavaScript or hardcoded spans.

**Incorrect (manual span):**

```tsx
<p>
  <span className={styles["first-line"]}>The opening line of this paragraph</span>
  is styled differently from the rest.
</p>
```

**Correct (native ::first-line):**

```css
.article p:first-of-type::first-line {
  font-variant-caps: small-caps;
  font-weight: var(--font-weight-medium);
}
```
