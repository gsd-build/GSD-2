---
title: Clean Up View Transition Names
impact: MEDIUM
tags: view-transition, cleanup
---

## Clean Up View Transition Names

Remove view-transition-name after transition completes.

**Incorrect (stale name):**

```ts
sourceImg.style.viewTransitionName = "card";
document.startViewTransition(() => {
  targetImg.style.viewTransitionName = "card";
});
```

**Correct (name cleaned up):**

```ts
sourceImg.style.viewTransitionName = "card";
document.startViewTransition(() => {
  sourceImg.style.viewTransitionName = "";
  targetImg.style.viewTransitionName = "card";
});
```
