---
title: Disable Font Synthesis for Missing Styles
impact: LOW
tags: type, synthesis, italic, bold
---

## Disable Font Synthesis for Missing Styles

Set font-synthesis: none to prevent the browser from faking bold or italic. Browser-generated faux styles look terrible.

**Correct:**

```css
.icon-font,
.display-font {
  font-synthesis: none;
}
```
