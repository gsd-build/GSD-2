---
title: Animate Shadows via Pseudo-Element Opacity
impact: MEDIUM
tags: visual, shadow, animation, performance
---

## Animate Shadows via Pseudo-Element Opacity

Transitioning box-shadow directly forces expensive repaints. Instead, put the target shadow on a pseudo-element and animate its opacity.

**Incorrect (animating box-shadow):**

```css
.card {
  box-shadow: var(--shadow-1);
  transition: box-shadow 0.2s ease;
}

.card:hover {
  box-shadow: var(--shadow-3);
}
```

**Correct (pseudo-element opacity):**

```css
.card {
  position: relative;
  box-shadow: var(--shadow-1);
}

.card::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: var(--shadow-3);
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
  z-index: -1;
}

.card:hover::after {
  opacity: 1;
}
```

Reference: [Designing Beautiful Shadows in CSS](https://www.joshwcomeau.com/css/designing-shadows/)
