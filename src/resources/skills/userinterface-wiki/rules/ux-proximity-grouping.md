---
title: Group Related Elements Spatially
impact: HIGH
tags: ux, proximity, grouping, layout
---

## Group Related Elements Spatially

Elements near each other are perceived as related. Use spacing to create visual groups.

**Incorrect (uniform spacing between unrelated items):**

```css
.form label,
.form input,
.form .hint,
.form .divider {
  margin-bottom: 16px;
}
```

**Correct (tighter spacing within groups, larger between):**

```css
.form label {
  margin-bottom: 4px;
}

.form input {
  margin-bottom: 2px;
}

.form .hint {
  margin-bottom: 24px;
}
```

Reference: [Law of Proximity](https://lawsofux.com/law-of-proximity/)
