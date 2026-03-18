---
title: Easing for System State Changes
impact: HIGH
tags: easing, state-change, system
---

## Easing for System State Changes

System-initiated state changes should use easing curves.

**Incorrect (spring for announcement):**

```tsx
<motion.div
  animate={{ y: 0 }}
  transition={{ type: "spring" }}
/>
```

**Correct (easing for announcement):**

```tsx
<motion.div
  animate={{ y: 0 }}
  transition={{ duration: 0.2, ease: "easeOut" }}
/>
```
