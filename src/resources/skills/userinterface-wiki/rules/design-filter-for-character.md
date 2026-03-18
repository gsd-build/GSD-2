---
title: Bandpass Filter for Sound Character
impact: MEDIUM
tags: design, filter, bandpass
---

## Bandpass Filter for Sound Character

Apply bandpass filter to shape percussive sounds.

**Incorrect (raw noise):**

```ts
source.connect(gain).connect(ctx.destination);
```

**Correct (filtered noise):**

```ts
const filter = ctx.createBiquadFilter();
filter.type = "bandpass";
filter.frequency.value = 4000;
filter.Q.value = 3;
source.connect(filter).connect(gain).connect(ctx.destination);
```
