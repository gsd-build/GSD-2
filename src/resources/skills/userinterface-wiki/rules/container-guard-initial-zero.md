---
title: Guard Against Zero on Initial Render
impact: HIGH
tags: container, measure, initial-render
---

## Guard Against Zero on Initial Render

On initial render, measured bounds are 0. Guard against this to prevent animating from 0 to actual size.

**Incorrect (animates from 0 on mount):**

```tsx
<motion.div animate={{ width: bounds.width }}>
  <div ref={ref}>{children}</div>
</motion.div>
```

**Correct (falls back to auto on first frame):**

```tsx
<motion.div animate={{ width: bounds.width > 0 ? bounds.width : "auto" }}>
  <div ref={ref}>{children}</div>
</motion.div>
```
