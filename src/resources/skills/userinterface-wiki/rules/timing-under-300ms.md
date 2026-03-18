---
title: User Animations Under 300ms
impact: CRITICAL
impactDescription: Exceeding 300ms for user-initiated actions degrades perceived responsiveness and makes the interface feel sluggish.
tags: timing, duration, animation
---

## User Animations Under 300ms

User-initiated animations must complete within 300ms.

**Incorrect (exceeds 300ms limit):**

```css
.button { transition: transform 400ms; }
```

**Correct (within 300ms):**

```css
.button { transition: transform 200ms; }
```
