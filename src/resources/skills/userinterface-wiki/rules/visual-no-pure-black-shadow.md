---
title: Use Neutral Colors for Shadows, Not Pure Black
impact: MEDIUM
tags: visual, shadow, color, neutral
---

## Use Neutral Colors for Shadows, Not Pure Black

Pure black shadows look harsh and artificial. Use deep neutrals or semi-transparent dark colors.

**Incorrect (pure black):**

```css
.card {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}
```

**Correct (neutral shadow):**

```css
.card {
  box-shadow: 0 4px 12px rgba(17, 24, 39, 0.08);
}
```
