---
title: Use Collapsed Constant for Unused Lines
impact: HIGH
tags: morphing, collapsed, structure
---

## Use Collapsed Constant for Unused Lines

Unused lines must use the collapsed constant, not omission or null.

**Incorrect (null for unused):**

```ts
const minusIcon = {
  lines: [
    { x1: 2, y1: 7, x2: 12, y2: 7 },
    null,
    null,
  ],
};
```

**Correct (collapsed constant):**

```ts
const minusIcon = {
  lines: [
    { x1: 2, y1: 7, x2: 12, y2: 7 },
    collapsed,
    collapsed,
  ],
};
```
