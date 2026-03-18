---
title: Click Filter 3000-6000Hz
impact: LOW
tags: param, filter, frequency
---

## Click Filter 3000-6000Hz

Bandpass filter for clicks should be 3000-6000Hz.

**Incorrect (too low):**

```ts
filter.frequency.value = 500;
```

**Correct (crisp range):**

```ts
filter.frequency.value = 4000;
```
