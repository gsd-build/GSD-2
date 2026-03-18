---
title: Exit Prop Required Inside AnimatePresence
impact: HIGH
tags: exit, prop, animate-presence
---

## Exit Prop Required Inside AnimatePresence

Elements inside AnimatePresence should have exit prop defined.

**Incorrect (missing exit):**

```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
  )}
</AnimatePresence>
```

**Correct (exit defined):**

```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    />
  )}
</AnimatePresence>
```
