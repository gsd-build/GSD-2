---
title: Expand Hit Areas with Invisible Padding
impact: HIGH
tags: ux, fitts, hit-area, pseudo
---

## Expand Hit Areas with Invisible Padding

Use pseudo-elements or invisible padding to expand clickable areas beyond visible bounds.

**Incorrect (visible size equals hit area):**

```css
.link {
  font-size: 14px;
  /* Hit area matches text only */
}
```

**Correct (expanded invisible hit area):**

```css
.link {
  position: relative;
}

.link::before {
  content: "";
  position: absolute;
  inset: -8px -12px;
}
```
