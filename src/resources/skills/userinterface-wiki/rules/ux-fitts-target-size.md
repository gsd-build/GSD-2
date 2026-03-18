---
title: Size Interactive Targets for Easy Clicking
impact: HIGH
tags: ux, fitts, target-size
---

## Size Interactive Targets for Easy Clicking

The bigger something is, the easier it is to click. Make interactive elements large enough to hit comfortably.

**Incorrect (tiny click target):**

```css
.icon-button {
  width: 16px;
  height: 16px;
  padding: 0;
}
```

**Correct (comfortable target):**

```css
.icon-button {
  width: 32px;
  height: 32px;
  padding: 8px;
}
```

Reference: Fitts, P. M. (1954). The information capacity of the human motor system.
