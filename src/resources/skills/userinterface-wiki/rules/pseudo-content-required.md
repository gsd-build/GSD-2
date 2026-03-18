---
title: Content Property Required for Pseudo-Elements
impact: HIGH
tags: pseudo, content, before-after
---

## Content Property Required for Pseudo-Elements

::before and ::after require content property to render.

**Incorrect (missing content):**

```css
.button::before {
  position: absolute;
  background: var(--gray-3);
}
```

**Correct (content set):**

```css
.button::before {
  content: "";
  position: absolute;
  background: var(--gray-3);
}
```
