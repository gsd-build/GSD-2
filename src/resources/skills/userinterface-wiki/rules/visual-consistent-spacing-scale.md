---
title: Use a Consistent Spacing Scale
impact: HIGH
tags: visual, spacing, scale, consistency
---

## Use a Consistent Spacing Scale

Don't use arbitrary pixel values for spacing. Define a scale and stick to it throughout the UI.

**Incorrect (arbitrary values):**

```css
.header { padding: 17px; }
.card { margin-bottom: 13px; }
.section { gap: 22px; }
```

**Correct (consistent scale):**

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
}

.header { padding: var(--space-4); }
.card { margin-bottom: var(--space-3); }
.section { gap: var(--space-5); }
```
