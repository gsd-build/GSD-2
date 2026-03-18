---
title: Fall Back Gracefully on Touch Devices
impact: MEDIUM
tags: prefetch, touch, mobile, fallback
---

## Fall Back Gracefully on Touch Devices

Touch devices have no cursor. Fall back to viewport or touch-start strategies automatically.

**Incorrect (assumes cursor exists):**

```tsx
function PrefetchLink({ href, children }) {
  return (
    <Link
      href={href}
      onMouseMove={() => prefetch(href)}
    >
      {children}
    </Link>
  );
}
```

**Correct (device-aware strategy):**

```tsx
const { elementRef } = useForesight({
  callback: () => router.prefetch(href),
  hitSlop: 20,
});
// Automatically falls back to touch-start on mobile
```
