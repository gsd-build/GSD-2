---
title: Active State Scale Transform
impact: HIGH
impactDescription: Missing active state makes interactive elements feel unresponsive and reduces tactile feedback.
tags: physics, interaction, active-state
---

## Active State Scale Transform

Interactive elements must have active/pressed state with scale transform.

**Incorrect (no active state):**

```css
.button:hover { background: var(--gray-3); }
/* Missing :active state */
```

**Correct (active state present):**

```css
.button:active { transform: scale(0.98); }
```
