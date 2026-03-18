---
title: View Transitions Over JS Libraries
impact: MEDIUM
tags: view-transition, native, performance
---

## View Transitions Over JS Libraries

Prefer View Transitions API over JavaScript animation libraries for page transitions.

**Incorrect (JS-based transition):**

```tsx
import { motion } from "motion/react";

function ImageLightbox() {
  return (
    <motion.img layoutId="hero" />
  );
}
```

**Correct (native View Transition):**

```ts
function openLightbox(img: HTMLImageElement) {
  img.style.viewTransitionName = "hero";
  document.startViewTransition(() => {
    // Native browser transition
  });
}
```
