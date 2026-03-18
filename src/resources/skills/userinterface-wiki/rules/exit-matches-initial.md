---
title: Exit Mirrors Initial for Symmetry
impact: MEDIUM
tags: exit, initial, symmetry
---

## Exit Mirrors Initial for Symmetry

Exit animation should mirror initial for symmetry.

**Incorrect (asymmetric exit):**

```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ scale: 0 }}
/>
```

**Correct (symmetric exit):**

```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: 20 }}
/>
```
