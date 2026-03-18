---
title: Springs for Interruptible Motion
impact: HIGH
tags: spring, interruptible, animation
---

## Springs for Interruptible Motion

Motion that can be interrupted must use springs.

**Incorrect (easing for interruptible):**

```tsx
<motion.div
  animate={{ x: isOpen ? 200 : 0 }}
  transition={{ duration: 0.3 }}
/>
```

**Correct (spring for interruptible):**

```tsx
<motion.div
  animate={{ x: isOpen ? 200 : 0 }}
  transition={{ type: "spring", stiffness: 400, damping: 25 }}
/>
```
