---
title: Use Continuous Weight Values with Variable Fonts
impact: LOW
tags: type, variable-font, weight
---

## Use Continuous Weight Values with Variable Fonts

Variable fonts accept any integer from 100-900, not just the standard stops at 400, 500, 600, 700.

**Incorrect (limited to standard stops):**

```css
.medium { font-weight: 500; }
.semibold { font-weight: 600; }
```

**Correct (precise weight control):**

```css
.medium { font-weight: 450; }
.semibold { font-weight: 550; }
```
