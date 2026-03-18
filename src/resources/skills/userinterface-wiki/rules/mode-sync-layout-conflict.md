---
title: Mode "sync" Causes Layout Conflicts
impact: MEDIUM
tags: mode, sync, layout
---

## Mode "sync" Causes Layout Conflicts

Mode "sync" causes layout conflicts; position exiting elements absolutely.

**Incorrect (sync with layout competition):**

```tsx
<AnimatePresence mode="sync">
  {items.map(item => (
    <motion.div exit={{ opacity: 0 }}>{item}</motion.div>
  ))}
</AnimatePresence>
```

**Correct (popLayout instead):**

```tsx
<AnimatePresence mode="popLayout">
  {items.map(item => (
    <motion.div exit={{ opacity: 0 }}>{item}</motion.div>
  ))}
</AnimatePresence>
```
