---
title: Dim Background for Focus
impact: MEDIUM
impactDescription: Transparent overlays fail to direct focus; dimmed backgrounds isolate the modal and reduce distraction.
tags: staging, modal, overlay
---

## Dim Background for Focus

Modal/dialog backgrounds should dim to direct focus.

**Incorrect (transparent overlay):**

```css
.overlay { background: transparent; }
```

**Correct (dimmed overlay):**

```css
.overlay { background: var(--black-a6); }
```
