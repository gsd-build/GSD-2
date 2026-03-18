---
title: Max 300ms for User Actions
impact: HIGH
tags: duration, max, user-action
---

## Max 300ms for User Actions

User-initiated animations must not exceed 300ms.

**Incorrect (exceeds limit):**

```tsx
<motion.div transition={{ duration: 0.5 }} />
```

**Correct (within limit):**

```tsx
<motion.div transition={{ duration: 0.25 }} />
```
