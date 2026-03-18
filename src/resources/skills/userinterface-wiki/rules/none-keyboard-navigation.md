---
title: No Animation for Keyboard Navigation
impact: MEDIUM
tags: none, keyboard, a11y
---

## No Animation for Keyboard Navigation

Keyboard navigation should be instant, no animation.

**Incorrect (animated focus):**

```tsx
function Menu() {
  return items.map(item => (
    <motion.li
      whileFocus={{ scale: 1.05 }}
      transition={{ duration: 0.2 }}
    />
  ));
}
```

**Correct (CSS focus-visible only):**

```tsx
function Menu() {
  return items.map(item => (
    <li className={styles.menuItem} />
  ));
}
```
