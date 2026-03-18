---
title: Shorten Duration Before Adjusting Curve
impact: MEDIUM
tags: duration, optimization
---

## Shorten Duration Before Adjusting Curve

If animation feels slow, shorten duration before adjusting curve.

**Incorrect (adjusting curve instead):**

```css
.element { transition: 400ms cubic-bezier(0, 0.9, 0.1, 1); }
```

**Correct (shorter duration):**

```css
.element { transition: 200ms ease-out; }
```
