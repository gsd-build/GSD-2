---
title: Gain Under 1.0
impact: MEDIUM
tags: param, gain, clipping
---

## Gain Under 1.0

Gain values should not exceed 1.0 to prevent clipping.

**Incorrect (clipping):**

```ts
gain.gain.setValueAtTime(1.5, t);
```

**Correct (safe gain):**

```ts
gain.gain.setValueAtTime(0.3, t);
```
