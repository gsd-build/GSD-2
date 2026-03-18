---
title: Balanced Spring Parameters
impact: MEDIUM
tags: spring, stiffness, damping
---

## Balanced Spring Parameters

Spring parameters must be balanced; avoid excessive oscillation.

**Incorrect (too bouncy):**

```tsx
transition={{
  type: "spring",
  stiffness: 1000,
  damping: 5,
}}
```

**Correct (balanced):**

```tsx
transition={{
  type: "spring",
  stiffness: 500,
  damping: 30,
}}
```
