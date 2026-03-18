---
title: Consistent ViewBox Size
impact: HIGH
tags: morphing, viewbox, svg
---

## Consistent ViewBox Size

All icons must use the same viewBox (14x14 recommended).

**Incorrect (mixed scales):**

```ts
const icon1 = { lines: [{ x1: 2, y1: 7, x2: 12, y2: 7 }, ...] }; // 14x14
const icon2 = { lines: [{ x1: 4, y1: 14, x2: 24, y2: 14 }, ...] }; // 28x28
```

**Correct (consistent scale):**

```ts
const VIEWBOX_SIZE = 14;
const CENTER = 7;
```
