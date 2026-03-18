---
title: Exponential Decay for Natural Sound
impact: HIGH
tags: envelope, decay, exponential
---

## Exponential Decay for Natural Sound

Use exponential ramps for natural decay, not linear.

**Incorrect (linear ramp):**

```ts
gain.gain.linearRampToValueAtTime(0, t + 0.05);
```

**Correct (exponential ramp):**

```ts
gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
```
