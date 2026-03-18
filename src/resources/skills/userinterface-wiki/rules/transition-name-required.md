---
title: View Transition Name Required
impact: HIGH
tags: view-transition, transition-name
---

## View Transition Name Required

Elements participating in view transitions need view-transition-name.

**Incorrect (no transition name):**

```ts
document.startViewTransition(() => {
  targetImg.src = newSrc;
});
```

**Correct (transition name assigned):**

```ts
sourceImg.style.viewTransitionName = "card";
document.startViewTransition(() => {
  sourceImg.style.viewTransitionName = "";
  targetImg.style.viewTransitionName = "card";
});
```
