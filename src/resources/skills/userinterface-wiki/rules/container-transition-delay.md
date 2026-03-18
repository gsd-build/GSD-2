---
title: Add Delay for Natural Container Transitions
impact: LOW
tags: container, delay, transition, natural
---

## Add Delay for Natural Container Transitions

Add a small delay to container size animations so the transition feels like it's catching up to the content.

**Correct:**

```tsx
<motion.div
  animate={{ height: bounds.height }}
  transition={{ duration: 0.2, delay: 0.05 }}
  style={{ overflow: "hidden" }}
>
  <div ref={ref}>{children}</div>
</motion.div>
```
