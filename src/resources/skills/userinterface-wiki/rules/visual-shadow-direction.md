---
title: Consistent Shadow Direction Across UI
impact: HIGH
tags: visual, shadow, direction, light-source
---

## Consistent Shadow Direction Across UI

All shadows must share the same offset direction to imply a single light source. Mixed directions feel broken.

**Incorrect (conflicting light sources):**

```css
.card { box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); }
.modal { box-shadow: 4px 0 8px rgba(0, 0, 0, 0.1); }
.tooltip { box-shadow: 0 -4px 8px rgba(0, 0, 0, 0.1); }
```

**Correct (consistent top-down light):**

```css
.card { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); }
.modal { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12); }
.tooltip { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); }
```
