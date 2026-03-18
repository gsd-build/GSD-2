---
title: Concentric Border Radius for Nested Elements
impact: HIGH
tags: visual, border-radius, concentric, nesting
---

## Concentric Border Radius for Nested Elements

When nesting rounded elements, inner radius must equal outer radius minus the gap. Same radius on both creates uneven curves.

**Incorrect (same radius on both):**

```css
.outer {
  border-radius: 16px;
  padding: 8px;
}

.inner {
  border-radius: 16px;
}
```

**Correct (concentric radius):**

```css
.outer {
  --padding: 8px;
  --inner-radius: 8px;

  border-radius: calc(var(--inner-radius) + var(--padding));
  padding: var(--padding);
}

.inner {
  border-radius: var(--inner-radius);
}
```

Reference: [Concentric Border Radius](https://jakub.kr/work/concentric-border-radius)
