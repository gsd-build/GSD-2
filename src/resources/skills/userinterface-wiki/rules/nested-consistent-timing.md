---
title: Coordinated Parent-Child Exit Timing
impact: MEDIUM
tags: nested, timing, exit
---

## Coordinated Parent-Child Exit Timing

Parent and child exit durations should be coordinated.

**Incorrect (parent too fast):**

```tsx
<motion.div exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
  <motion.div exit={{ scale: 0 }} transition={{ duration: 0.5 }} />
</motion.div>
```

**Correct (coordinated timing):**

```tsx
<motion.div exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
  <motion.div exit={{ scale: 0 }} transition={{ duration: 0.15 }} />
</motion.div>
```
