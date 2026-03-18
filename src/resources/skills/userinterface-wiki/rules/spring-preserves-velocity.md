---
title: Springs Preserve Input Velocity
impact: MEDIUM
tags: spring, velocity, drag
---

## Springs Preserve Input Velocity

When velocity matters, use springs to preserve input energy.

**Incorrect (velocity ignored):**

```tsx
onDragEnd={(e, info) => {
  animate(target, { x: 0 }, { duration: 0.3 });
}}
```

**Correct (velocity preserved):**

```tsx
onDragEnd={(e, info) => {
  animate(target, { x: 0 }, {
    type: "spring",
    velocity: info.velocity.x,
  });
}}
```
