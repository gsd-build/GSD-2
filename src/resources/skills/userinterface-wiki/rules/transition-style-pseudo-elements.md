---
title: Style View Transition Pseudo-Elements
impact: MEDIUM
tags: view-transition, pseudo, styling
---

## Style View Transition Pseudo-Elements

Style view transition pseudo-elements for custom animations.

**Incorrect (default crossfade only):**

```ts
document.startViewTransition(() => { /* ... */ });
```

**Correct (custom animation):**

```css
::view-transition-group(card) {
  animation-duration: 300ms;
  animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
}
```
