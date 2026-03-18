---
title: Noise for Percussive Sounds
impact: MEDIUM
tags: design, noise, percussion
---

## Noise for Percussive Sounds

Use filtered noise for clicks/taps, not oscillators.

**Incorrect (oscillator for click):**

```ts
const osc = ctx.createOscillator();
osc.type = "sine";
```

**Correct (noise burst for click):**

```ts
const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.008, ctx.sampleRate);
const data = buffer.getChannelData(0);
for (let i = 0; i < data.length; i++) {
  data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 50);
}
```
