---
title: Mode "wait" Doubles Duration
impact: MEDIUM
tags: mode, wait, duration
---

## Mode "wait" Doubles Duration

Mode "wait" nearly doubles animation duration; adjust timing accordingly.

**Incorrect (too slow with wait):**

```tsx
<AnimatePresence mode="wait">
  <motion.div transition={{ duration: 0.3 }} />
</AnimatePresence>
```

**Correct (halved timing):**

```tsx
<AnimatePresence mode="wait">
  <motion.div transition={{ duration: 0.15 }} />
</AnimatePresence>
```
