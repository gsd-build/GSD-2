---
title: Springs for Gesture-Driven Motion
impact: HIGH
tags: spring, gesture, drag
---

## Springs for Gesture-Driven Motion

Gesture-driven motion (drag, flick, swipe) must use springs.

**Incorrect (easing for drag):**

```tsx
<motion.div
  drag="x"
  transition={{ duration: 0.3, ease: "easeOut" }}
/>
```

**Correct (spring for drag):**

```tsx
<motion.div
  drag="x"
  transition={{ type: "spring", stiffness: 500, damping: 30 }}
/>
```
