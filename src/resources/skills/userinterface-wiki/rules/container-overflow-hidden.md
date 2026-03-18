---
title: Overflow Hidden on Animated Container
impact: MEDIUM
tags: container, overflow, clip
---

## Overflow Hidden on Animated Container

Set overflow: hidden on the animated outer container to clip content during size transitions.

**Incorrect (content overflows during animation):**

```tsx
<motion.div animate={{ height: bounds.height }}>
  <div ref={ref}>{children}</div>
</motion.div>
```

**Correct (clipped during transition):**

```tsx
<motion.div animate={{ height: bounds.height }} style={{ overflow: "hidden" }}>
  <div ref={ref}>{children}</div>
</motion.div>
```
