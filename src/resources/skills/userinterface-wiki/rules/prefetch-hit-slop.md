---
title: Use hitSlop to Trigger Predictions Earlier
impact: MEDIUM
tags: prefetch, hit-slop, target
---

## Use hitSlop to Trigger Predictions Earlier

Expand the invisible prediction area around elements with hitSlop to start loading sooner.

**Incorrect (tight prediction area):**

```tsx
const { elementRef } = useForesight({
  callback: () => prefetch(),
  hitSlop: 0,
});
```

**Correct (expanded prediction area):**

```tsx
const { elementRef } = useForesight({
  callback: () => prefetch(),
  hitSlop: 20,
});
```
