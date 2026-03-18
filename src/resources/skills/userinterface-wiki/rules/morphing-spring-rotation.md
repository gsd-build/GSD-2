---
title: Spring Physics for Rotation
impact: MEDIUM
tags: morphing, spring, rotation
---

## Spring Physics for Rotation

Rotation between grouped icons should use spring physics for natural motion.

**Incorrect (duration-based rotation):**

```tsx
<motion.g animate={{ rotate: rotation }} transition={{ duration: 0.3 }} />
```

**Correct (spring rotation):**

```tsx
const rotation = useSpring(definition.rotation ?? 0, activeTransition);

<motion.g style={{ rotate: rotation, transformOrigin: "center" }} />
```
