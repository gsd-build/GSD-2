---
title: Simplify Complex Visuals into Clear Forms
impact: MEDIUM
tags: ux, pragnanz, simplicity, clarity
---

## Simplify Complex Visuals into Clear Forms

People interpret complex visuals as the simplest form possible. Reduce visual noise to aid comprehension.

**Incorrect (visually noisy layout):**

```css
.card {
  border: 2px dashed red;
  background: linear-gradient(45deg, #f0f, #0ff);
  box-shadow: 5px 5px 0 black, 10px 10px 0 gray;
  outline: 3px dotted blue;
}
```

**Correct (clear, simple form):**

```css
.card {
  background: var(--gray-2);
  border: 1px solid var(--gray-a4);
  border-radius: 12px;
  box-shadow: var(--shadow-1);
}
```

Reference: [Law of Prägnanz](https://lawsofux.com/law-of-pragnanz/)
