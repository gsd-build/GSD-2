---
title: Oscillators for Tonal Sounds
impact: MEDIUM
tags: design, oscillator, tonal
---

## Oscillators for Tonal Sounds

Use oscillators with pitch movement for tonal sounds (pops, confirmations).

**Incorrect (static frequency):**

```ts
osc.frequency.value = 400;
```

**Correct (pitch sweep):**

```ts
osc.frequency.setValueAtTime(400, t);
osc.frequency.exponentialRampToValueAtTime(600, t + 0.04);
```
