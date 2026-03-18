---
title: Pair Justified Text with Hyphens
impact: MEDIUM
tags: type, justify, hyphens, rivers
---

## Pair Justified Text with Hyphens

Justified text without hyphens creates rivers of whitespace. Always pair with hyphens: auto.

**Incorrect (rivers of whitespace):**

```css
.article { text-align: justify; }
```

**Correct (hyphenation prevents rivers):**

```css
.article {
  text-align: justify;
  hyphens: auto;
}
```
