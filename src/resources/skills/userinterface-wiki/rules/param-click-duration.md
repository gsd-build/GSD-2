---
title: Click Duration 5-15ms
impact: MEDIUM
tags: param, click, duration
---

## Click Duration 5-15ms

Click/tap sounds should be 5-15ms duration.

**Incorrect (too long):**

```ts
const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
```

**Correct (appropriate duration):**

```ts
const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.008, ctx.sampleRate);
```
