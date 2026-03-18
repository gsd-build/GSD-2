---
title: No Linear Easing for Motion
impact: MEDIUM
impactDescription: Linear easing for motion feels mechanical; reserve it for progress indicators where uniform speed is expected.
tags: easing, linear, animation
---

## No Linear Easing for Motion

Linear easing should only be used for progress indicators, not motion.

**Incorrect (linear for motion):**

```css
.card { transition: transform 200ms linear; }
```

**Correct (linear for progress only):**

```css
.progress-bar { transition: width 100ms linear; }
```
