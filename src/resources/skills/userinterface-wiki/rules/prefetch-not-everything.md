---
title: Prefetch by Intent, Not Viewport
impact: HIGH
tags: prefetch, viewport, intent, bundle-size
---

## Prefetch by Intent, Not Viewport

Don't prefetch everything visible in the viewport. Prefetch based on user intent to avoid wasted bandwidth.

**Incorrect (prefetch all visible links):**

```tsx
<Link href="/page" prefetch={true}>Page</Link>
```

**Correct (intent-based prefetching):**

```tsx
<Link href="/page" prefetch={false}>Page</Link>
// Let trajectory/hover prediction handle it
```
