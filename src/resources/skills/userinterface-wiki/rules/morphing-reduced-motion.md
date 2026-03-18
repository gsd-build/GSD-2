---
title: Reduced Motion Support for Icons
impact: MEDIUM
tags: morphing, a11y, reduced-motion
---

## Reduced Motion Support for Icons

Respect prefers-reduced-motion by disabling animations.

**Incorrect (always animates):**

```tsx
function MorphingIcon({ icon }: Props) {
  return <motion.line animate={...} transition={{ duration: 0.4 }} />;
}
```

**Correct (respects preference):**

```tsx
function MorphingIcon({ icon }: Props) {
  const reducedMotion = useReducedMotion() ?? false;
  const activeTransition = reducedMotion ? { duration: 0 } : transition;
  
  return <motion.line animate={...} transition={activeTransition} />;
}
```
