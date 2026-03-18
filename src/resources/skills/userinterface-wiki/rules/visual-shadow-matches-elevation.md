---
title: Shadow Size Indicates Elevation
impact: MEDIUM
tags: visual, shadow, elevation, hierarchy
---

## Shadow Size Indicates Elevation

Larger blur and offset means higher elevation. Use a consistent shadow scale across your UI.

**Correct (elevation scale):**

```css
:root {
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-2: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-3: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.card { box-shadow: var(--shadow-1); }
.dropdown { box-shadow: var(--shadow-2); }
.modal { box-shadow: var(--shadow-3); }
```
