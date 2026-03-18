---
title: Similar Elements Should Look Alike
impact: HIGH
tags: ux, similarity, consistency, visual
---

## Similar Elements Should Look Alike

Elements that function the same should look the same. Visual consistency signals functional consistency.

**Incorrect (same function, different appearance):**

```css
.save-button {
  background: blue;
  border-radius: 8px;
}

.submit-button {
  background: green;
  border-radius: 0;
}
```

**Correct (same function, same appearance):**

```css
.primary-action {
  background: var(--gray-12);
  color: var(--gray-1);
  border-radius: 8px;
}
```

Reference: [Law of Similarity](https://lawsofux.com/law-of-similarity/)
