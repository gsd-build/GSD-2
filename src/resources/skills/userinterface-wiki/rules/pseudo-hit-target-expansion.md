---
title: Hit Target Expansion with Pseudo-Elements
impact: MEDIUM
tags: pseudo, hit-target, accessibility
---

## Hit Target Expansion with Pseudo-Elements

Use negative inset values to expand hit targets without extra markup.

**Incorrect (wrapper for hit target):**

```tsx
<div className={styles.wrapper}>
  <a className={styles.link}>Link</a>
</div>
```

**Correct (pseudo-element expansion):**

```css
.link {
  position: relative;
}

.link::before {
  content: "";
  position: absolute;
  inset: -8px -12px;
}
```
