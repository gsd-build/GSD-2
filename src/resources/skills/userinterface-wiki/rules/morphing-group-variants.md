---
title: Shared Group for Rotational Variants
impact: HIGH
tags: morphing, group, rotation
---

## Shared Group for Rotational Variants

Icons that are rotational variants MUST share the same group and base lines.

**Incorrect (different line definitions):**

```ts
const arrowRight = { lines: [{ x1: 2, y1: 7, x2: 12, y2: 7 }, ...] };
const arrowDown = { lines: [{ x1: 7, y1: 2, x2: 7, y2: 12 }, ...] };
```

**Correct (shared base lines):**

```ts
const arrowLines: [IconLine, IconLine, IconLine] = [
  { x1: 2, y1: 7, x2: 12, y2: 7 },
  { x1: 7.5, y1: 2.5, x2: 12, y2: 7 },
  { x1: 7.5, y1: 11.5, x2: 12, y2: 7 },
];

const icons = {
  "arrow-right": { lines: arrowLines, rotation: 0, group: "arrow" },
  "arrow-down": { lines: arrowLines, rotation: 90, group: "arrow" },
  "arrow-left": { lines: arrowLines, rotation: 180, group: "arrow" },
  "arrow-up": { lines: arrowLines, rotation: -90, group: "arrow" },
};
```
