---
title: Unique View Transition Names
impact: HIGH
tags: view-transition, unique, naming
---

## Unique View Transition Names

Each view-transition-name must be unique on the page during transition.

**Incorrect (duplicate names):**

```css
.card {
  view-transition-name: card;
}
/* Multiple cards with same name */
```

**Correct (unique per element):**

```ts
element.style.viewTransitionName = `card-${id}`;
```
