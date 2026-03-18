---
title: Linear Easing Only for Progress
impact: MEDIUM
tags: easing, linear, progress
---

## Linear Easing Only for Progress

Linear easing only for progress bars and time representation.

**Incorrect (linear for motion):**

```css
.card-slide { transition: transform 200ms linear; }
```

**Correct (linear for progress):**

```css
.progress-bar { transition: width 100ms linear; }
```
