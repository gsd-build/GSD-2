---
title: Set Initial Value Before Ramp
impact: MEDIUM
tags: envelope, initial, glitch
---

## Set Initial Value Before Ramp

Set initial value before ramping to avoid glitches.

**Incorrect (no initial value):**

```ts
gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
```

**Correct (initial value set):**

```ts
gain.gain.setValueAtTime(0.3, t);
gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
```
