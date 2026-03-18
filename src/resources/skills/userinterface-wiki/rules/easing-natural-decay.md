---
title: Exponential Ramps for Natural Decay
impact: MEDIUM
impactDescription: Linear ramps for decay produce abrupt, unnatural cutoffs; exponential ramps match perceptual expectations.
tags: easing, decay, audio, animation
---

## Exponential Ramps for Natural Decay

Use exponential ramps, not linear, for natural decay.

**Incorrect (linear ramp):**

```ts
gain.gain.linearRampToValueAtTime(0, t + 0.05);
```

**Correct (exponential ramp):**

```ts
gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
```
