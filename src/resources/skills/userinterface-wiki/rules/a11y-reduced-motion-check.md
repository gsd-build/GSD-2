---
title: Respect prefers-reduced-motion for Sound
impact: HIGH
tags: a11y, reduced-motion, sound
---

## Respect prefers-reduced-motion for Sound

Respect prefers-reduced-motion as proxy for sound sensitivity.

**Incorrect (ignores preference):**

```tsx
function playSound(name: string) {
  audio.play();
}
```

**Correct (checks preference):**

```tsx
function playSound(name: string) {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  
  if (prefersReducedMotion) return;
  audio.play();
}
```
