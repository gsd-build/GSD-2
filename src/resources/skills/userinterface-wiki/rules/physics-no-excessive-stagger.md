---
title: Stagger Under 50ms Per Item
impact: MEDIUM
impactDescription: Excessive stagger delays list readiness and feels sluggish; keep per-item delay minimal.
tags: physics, stagger, list-animation
---

## Stagger Under 50ms Per Item

Stagger delays must not exceed 50ms per item.

**Incorrect (excessive stagger):**

```tsx
transition={{ staggerChildren: 0.15 }}
```

**Correct (reasonable stagger):**

```tsx
transition={{ staggerChildren: 0.03 }}
```
