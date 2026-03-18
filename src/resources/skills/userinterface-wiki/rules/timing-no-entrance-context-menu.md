---
title: No Entrance Animation on Context Menus
impact: HIGH
impactDescription: Entrance animations on context menus delay access to options and feel unnecessary for ephemeral UI.
tags: timing, context-menu, entrance
---

## No Entrance Animation on Context Menus

Context menus should not animate on entrance (exit only).

**Incorrect (animates entrance):**

```tsx
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
```

**Correct (exit only):**

```tsx
<motion.div exit={{ opacity: 0 }} />
```
