---
title: Layer Multiple Shadows for Realistic Depth
impact: HIGH
tags: visual, shadow, layered, depth
---

## Layer Multiple Shadows for Realistic Depth

A single box-shadow looks flat. Layer multiple shadows with increasing blur and decreasing opacity to mimic real light.

**Incorrect (single flat shadow):**

```css
.card {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}
```

**Correct (layered shadows):**

```css
.card {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.06),
    0 4px 8px rgba(0, 0, 0, 0.04),
    0 12px 24px rgba(0, 0, 0, 0.03);
}
```

Reference: [Designing Beautiful Shadows in CSS](https://www.joshwcomeau.com/css/designing-shadows/)
