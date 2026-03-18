---
title: Z-Index Layering for Pseudo-Elements
impact: MEDIUM
tags: pseudo, z-index, layering
---

## Z-Index Layering for Pseudo-Elements

Pseudo-elements need z-index to layer correctly with content.

**Incorrect (covers text):**

```css
.button::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--gray-3);
}
```

**Correct (layered behind):**

```css
.button {
  position: relative;
  z-index: 1;
}

.button::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--gray-3);
  z-index: -1;
}
```
