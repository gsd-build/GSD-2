---
title: Use font-display swap to Avoid Invisible Text
impact: MEDIUM
tags: type, font-display, loading, FOIT
---

## Use font-display swap to Avoid Invisible Text

Set font-display: swap so text renders immediately with a fallback font while the custom font loads.

**Incorrect (invisible text during load):**

```css
@font-face {
  font-family: "Inter";
  src: url("/fonts/inter.woff2") format("woff2");
}
```

**Correct (text visible immediately):**

```css
@font-face {
  font-family: "Inter";
  src: url("/fonts/inter.woff2") format("woff2");
  font-display: swap;
}
```
