---
title: AnimatePresence Wrapper Required
impact: HIGH
tags: exit, animate-presence, wrapper
---

## AnimatePresence Wrapper Required

Conditional motion elements must be wrapped in AnimatePresence.

**Incorrect (no wrapper):**

```tsx
{isVisible && (
  <motion.div exit={{ opacity: 0 }} />
)}
```

**Correct (wrapped):**

```tsx
<AnimatePresence>
  {isVisible && (
    <motion.div exit={{ opacity: 0 }} />
  )}
</AnimatePresence>
```
