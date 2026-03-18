---
title: Respond Within 400ms
impact: CRITICAL
tags: ux, doherty, latency, response-time
---

## Respond Within 400ms

Interactions must respond within 400ms to feel instant. Above this threshold, users notice delay.

**Incorrect (no feedback during loading):**

```tsx
async function handleClick() {
  const data = await fetchData();
  setResult(data);
}
```

**Correct (immediate optimistic feedback):**

```tsx
async function handleClick() {
  setResult(optimisticData);
  const data = await fetchData();
  setResult(data);
}
```

Reference: Doherty, W. J. (1979). Managing VM/CMS systems for user effectiveness.
