---
title: Position Relative Parent for Pseudo-Elements
impact: HIGH
tags: pseudo, position, relative
---

## Position Relative Parent for Pseudo-Elements

Parent must have position: relative for absolute pseudo-elements.

**Incorrect (no position on parent):**

```css
.button::before {
  content: "";
  position: absolute;
  inset: 0;
}
```

**Correct (parent positioned):**

```css
.button {
  position: relative;
}

.button::before {
  content: "";
  position: absolute;
  inset: 0;
}
```
