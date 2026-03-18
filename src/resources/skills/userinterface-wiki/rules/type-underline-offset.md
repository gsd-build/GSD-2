---
title: Offset Underlines from Descenders
impact: MEDIUM
tags: type, underline, offset, decoration
---

## Offset Underlines from Descenders

Use text-underline-offset to push underlines below descenders so they look intentional.

**Incorrect (underline collides with descenders):**

```css
a { text-decoration: underline; }
```

**Correct (offset underline):**

```css
a {
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-skip-ink: auto;
}
```
