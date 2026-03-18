---
title: Icons Must Use Exactly Three Lines
impact: HIGH
tags: morphing, svg, structure
---

## Icons Must Use Exactly Three Lines

Every icon MUST use exactly 3 lines. No more, no fewer.

**Incorrect (only 2 lines):**

```ts
const checkIcon = {
  lines: [
    { x1: 2, y1: 7.5, x2: 5.5, y2: 11 },
    { x1: 5.5, y1: 11, x2: 12, y2: 3 },
  ],
};
```

**Correct (3 lines with collapsed):**

```ts
const checkIcon = {
  lines: [
    { x1: 2, y1: 7.5, x2: 5.5, y2: 11 },
    { x1: 5.5, y1: 11, x2: 12, y2: 3 },
    collapsed,
  ],
};
```
