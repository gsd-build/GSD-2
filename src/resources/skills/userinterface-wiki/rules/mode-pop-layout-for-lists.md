---
title: popLayout for List Reordering
impact: MEDIUM
tags: mode, pop-layout, list
---

## popLayout for List Reordering

Use popLayout mode for list reordering animations.

**Incorrect (default mode causes shifts):**

```tsx
<AnimatePresence>
  {items.map(item => <ListItem key={item.id} />)}
</AnimatePresence>
```

**Correct (popLayout prevents shifts):**

```tsx
<AnimatePresence mode="popLayout">
  {items.map(item => <ListItem key={item.id} />)}
</AnimatePresence>
```
