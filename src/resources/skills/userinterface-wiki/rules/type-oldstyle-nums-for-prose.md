---
title: Oldstyle Numbers for Body Text
impact: MEDIUM
tags: type, numeric, oldstyle, prose
---

## Oldstyle Numbers for Body Text

Use oldstyle-nums in body text so numbers blend with lowercase letters. Use lining-nums in tables and headings.

**Correct (prose):**

```css
.body-text { font-variant-numeric: oldstyle-nums; }
```

**Correct (data):**

```css
.data-table { font-variant-numeric: lining-nums tabular-nums; }
```
