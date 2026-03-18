---
title: Pseudo-Elements Over DOM Nodes
impact: MEDIUM
tags: pseudo, dom, decorative
---

## Pseudo-Elements Over DOM Nodes

Use pseudo-elements for decorative content instead of extra DOM nodes.

**Incorrect (extra DOM node):**

```tsx
<button className={styles.button}>
  <span className={styles.background} />
  Click me
</button>
```

**Correct (pseudo-element):**

```tsx
<button className={styles.button}>
  Click me
</button>
```
```css
.button::before {
  content: "";
  /* decorative background */
}
```
