---
title: Aria Hidden on Icon SVGs
impact: LOW
tags: morphing, a11y, aria
---

## Aria Hidden on Icon SVGs

Icon SVGs should be aria-hidden since they're decorative.

**Incorrect (no aria attribute):**

```tsx
<svg width={size} height={size}>...</svg>
```

**Correct (aria-hidden):**

```tsx
<svg width={size} height={size} aria-hidden="true">...</svg>
```
