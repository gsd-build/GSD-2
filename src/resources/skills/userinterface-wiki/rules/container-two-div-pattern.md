---
title: Two-Div Pattern for Animated Bounds
impact: HIGH
tags: container, measure, motion
---

## Two-Div Pattern for Animated Bounds

Use an outer animated div and an inner measured div. Never measure and animate the same element.

**Incorrect (measure and animate same element — creates feedback loop):**

```tsx
function AnimatedContainer({ children }) {
  const [ref, bounds] = useMeasure();
  return (
    <motion.div ref={ref} animate={{ height: bounds.height }}>
      {children}
    </motion.div>
  );
}
```

**Correct (separate measure and animate targets):**

```tsx
function AnimatedContainer({ children }) {
  const [ref, bounds] = useMeasure();
  return (
    <motion.div animate={{ height: bounds.height }}>
      <div ref={ref}>{children}</div>
    </motion.div>
  );
}
```
