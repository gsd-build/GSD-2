---
title: Use Semi-Transparent Borders for Subtle Separation
impact: MEDIUM
tags: visual, border, alpha, separation
---

## Use Semi-Transparent Borders for Subtle Separation

Semi-transparent borders adapt to any background color and create subtle, non-jarring separation.

**Incorrect (hardcoded border color):**

```css
.card {
  border: 1px solid #e5e5e5;
}
```

**Correct (alpha border):**

```css
.card {
  border: 1px solid var(--gray-a4);
}
```
