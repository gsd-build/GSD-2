---
title: Consistent Timing for Similar Elements
impact: CRITICAL
impactDescription: Inconsistent timing across similar elements creates a disjointed, unpolished feel and undermines design system coherence.
tags: timing, consistency, animation
---

## Consistent Timing for Similar Elements

Similar elements must use identical timing values.

**Incorrect (inconsistent timing):**

```css
.button-primary { transition: 200ms; }
.button-secondary { transition: 150ms; }
```

**Correct (consistent timing):**

```css
.button-primary { transition: 200ms; }
.button-secondary { transition: 200ms; }
```
