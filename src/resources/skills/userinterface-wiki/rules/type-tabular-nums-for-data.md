---
title: Tabular Numbers for Data Display
impact: HIGH
tags: type, numeric, tabular, alignment
---

## Tabular Numbers for Data Display

Use tabular-nums for any numeric data that should align in columns (tables, dashboards, pricing).

**Incorrect (proportional numbers misalign):**

```css
.price { font-variant-numeric: proportional-nums; }
```

**Correct (tabular numbers align):**

```css
.price { font-variant-numeric: tabular-nums; }
```
