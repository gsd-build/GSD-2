---
title: No Entrance Animation for Context Menus
impact: MEDIUM
tags: none, context-menu, entrance
---

## No Entrance Animation for Context Menus

Context menus should not animate on entrance (exit only).

**Incorrect (entrance animation):**

```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0 }}
/>
```

**Correct (exit only):**

```tsx
<motion.div exit={{ opacity: 0, scale: 0.95 }} />
```
