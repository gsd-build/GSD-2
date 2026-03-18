---
title: No Zero Target for Exponential Ramps
impact: HIGH
tags: envelope, exponential, zero
---

## No Zero Target for Exponential Ramps

Exponential ramps cannot target 0; use 0.001 or similar small value.

**Incorrect (targets zero):**

```ts
gain.gain.exponentialRampToValueAtTime(0, t + 0.05);
```

**Correct (targets near-zero):**

```ts
gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
```
