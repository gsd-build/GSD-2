---
title: Single Focal Point
impact: MEDIUM
impactDescription: Competing animations split attention and reduce clarity; one focal point guides the user effectively.
tags: staging, focus, attention
---

## Single Focal Point

Only one element should animate prominently at a time.

**Incorrect (competing animations):**

```tsx
<motion.div animate={{ scale: 1.1 }} />
<motion.div animate={{ scale: 1.1 }} />
```

**Correct (single focal point):**

```tsx
<motion.div animate={{ scale: 1.1 }} />
<motion.div animate={{ scale: 1 }} />
```
