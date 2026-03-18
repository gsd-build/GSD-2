---
title: Z-Index Layering for Animated Elements
impact: MEDIUM
impactDescription: Missing z-index causes tooltips and overlays to render behind other content, breaking the visual hierarchy.
tags: staging, z-index, layering
---

## Z-Index Layering for Animated Elements

Animated elements must respect z-index layering.

**Incorrect (no z-index):**

```css
.tooltip { /* No z-index, may render behind other elements */ }
```

**Correct (explicit z-index):**

```css
.tooltip { z-index: 50; }
```
