---
title: Propagate Prop for Nested AnimatePresence
impact: HIGH
tags: nested, propagate, exit
---

## Propagate Prop for Nested AnimatePresence

Nested AnimatePresence must use propagate prop for coordinated exits.

**Incorrect (children vanish instantly):**

```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div exit={{ opacity: 0 }}>
      <AnimatePresence>
        {items.map(item => (
          <motion.div key={item.id} exit={{ scale: 0 }} />
        ))}
      </AnimatePresence>
    </motion.div>
  )}
</AnimatePresence>
```

**Correct (propagate on both):**

```tsx
<AnimatePresence propagate>
  {isOpen && (
    <motion.div exit={{ opacity: 0 }}>
      <AnimatePresence propagate>
        {items.map(item => (
          <motion.div key={item.id} exit={{ scale: 0 }} />
        ))}
      </AnimatePresence>
    </motion.div>
  )}
</AnimatePresence>
```
