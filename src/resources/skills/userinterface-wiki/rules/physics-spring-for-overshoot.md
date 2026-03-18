---
title: Springs for Overshoot and Settle
impact: HIGH
impactDescription: Easing cannot produce natural overshoot; springs are required for organic bounce-and-settle motion.
tags: physics, spring, overshoot
---

## Springs for Overshoot and Settle

Use springs (not easing) when overshoot-and-settle is needed.

**Incorrect (easing for bounce):**

```tsx
<motion.div transition={{ duration: 0.3, ease: "easeOut" }} />
// When element should bounce/settle
```

**Correct (spring physics):**

```tsx
<motion.div transition={{ type: "spring", stiffness: 500, damping: 30 }} />
```
