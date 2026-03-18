---
title: Prefetch on Keyboard Navigation
impact: MEDIUM
tags: prefetch, keyboard, tab, a11y
---

## Prefetch on Keyboard Navigation

Monitor focus changes and prefetch when the user is a few tab stops away from a registered element.

**Correct (tab-aware prefetching):**

```tsx
const { elementRef } = useForesight({
  callback: () => router.prefetch("/settings"),
  name: "settings-link",
  // Tab prediction fires when focus approaches
});
```
