---
title: Instant Jump for Non-Grouped Icons
impact: MEDIUM
tags: morphing, jump, group
---

## Instant Jump for Non-Grouped Icons

When transitioning between icons NOT in the same group, rotation should jump instantly.

**Incorrect (always animates rotation):**

```tsx
useEffect(() => {
  rotation.set(definition.rotation ?? 0);
}, [definition]);
```

**Correct (jumps when not grouped):**

```tsx
useEffect(() => {
  if (shouldRotate) {
    rotation.set(definition.rotation ?? 0);
  } else {
    rotation.jump(definition.rotation ?? 0);
  }
}, [definition, shouldRotate]);
```
