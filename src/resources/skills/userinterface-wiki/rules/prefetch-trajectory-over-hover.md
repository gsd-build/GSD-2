---
title: Trajectory Prediction Over Hover Prefetching
impact: HIGH
tags: prefetch, trajectory, hover, performance
---

## Trajectory Prediction Over Hover Prefetching

Hover prefetching starts too late. Trajectory prediction fires while the cursor is still in motion, reclaiming 100-200ms.

**Incorrect (waits for hover):**

```tsx
<Link
  href="/about"
  onMouseEnter={() => router.prefetch("/about")}
>
  About
</Link>
```

**Correct (trajectory-based):**

```tsx
const { elementRef } = useForesight({
  callback: () => router.prefetch("/about"),
  hitSlop: 20,
  name: "about-link",
});

<Link ref={elementRef} href="/about">About</Link>
```
