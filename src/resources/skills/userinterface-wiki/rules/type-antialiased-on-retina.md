---
title: Use Antialiased Font Smoothing
impact: MEDIUM
tags: type, rendering, antialiased
---

## Use Antialiased Font Smoothing

Set -webkit-font-smoothing: antialiased on retina displays. The default subpixel rendering looks thicker and fuzzier.

**Correct:**

```css
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```
