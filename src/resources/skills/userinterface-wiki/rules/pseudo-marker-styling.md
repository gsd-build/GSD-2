---
title: Use ::marker for Custom List Bullets
impact: LOW
tags: pseudo, marker, list, bullets
---

## Use ::marker for Custom List Bullets

Use ::marker to style list bullets without extra elements or background-image hacks.

**Incorrect (background image hack):**

```css
li {
  list-style: none;
  background: url("bullet.svg") no-repeat 0 4px;
  padding-left: 20px;
}
```

**Correct (native ::marker):**

```css
li::marker {
  color: var(--gray-8);
  font-size: 0.8em;
}
```
