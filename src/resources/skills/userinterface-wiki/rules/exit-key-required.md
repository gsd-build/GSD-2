---
title: Unique Keys in AnimatePresence Lists
impact: HIGH
tags: exit, key, list
---

## Unique Keys in AnimatePresence Lists

Dynamic lists inside AnimatePresence must have unique keys.

**Incorrect (index as key):**

```tsx
<AnimatePresence>
  {items.map((item, index) => (
    <motion.div key={index} exit={{ opacity: 0 }} />
  ))}
</AnimatePresence>
```

**Correct (stable unique key):**

```tsx
<AnimatePresence>
  {items.map((item) => (
    <motion.div key={item.id} exit={{ opacity: 0 }} />
  ))}
</AnimatePresence>
```
