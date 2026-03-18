---
title: Keep Optical Sizing Auto
impact: MEDIUM
tags: type, variable-font, optical-sizing
---

## Keep Optical Sizing Auto

Leave font-optical-sizing at auto. The font adjusts glyph shapes for the current size — thicker strokes at small sizes, finer details at large sizes.

**Incorrect (forced optical size):**

```css
body {
  font-optical-sizing: none;
}
```

**Correct (automatic adjustment):**

```css
body {
  font-optical-sizing: auto;
}
```
