---
title: Round Stroke Line Caps
impact: LOW
tags: morphing, stroke, svg
---

## Round Stroke Line Caps

Lines should use strokeLinecap="round" for polished endpoints.

**Incorrect (butt caps):**

```tsx
<motion.line strokeLinecap="butt" />
```

**Correct (round caps):**

```tsx
<motion.line strokeLinecap="round" />
```
