---
title: Subtle Squash and Stretch
impact: MEDIUM
impactDescription: Excessive squash/stretch feels cartoonish and distracts from the interface; subtle deformation adds polish.
tags: physics, squash-stretch, deformation
---

## Subtle Squash and Stretch

Squash/stretch deformation must be subtle (0.95-1.05 range).

**Incorrect (excessive deformation):**

```tsx
<motion.div whileTap={{ scale: 0.8 }} />
```

**Correct (subtle deformation):**

```tsx
<motion.div whileTap={{ scale: 0.98 }} />
```
