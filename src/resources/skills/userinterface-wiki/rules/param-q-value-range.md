---
title: Filter Q Value 2-5
impact: LOW
tags: param, q-value, filter
---

## Filter Q Value 2-5

Filter Q for clicks should be 2-5 for focused but not harsh sound.

**Incorrect (too resonant):**

```ts
filter.Q.value = 15;
```

**Correct (balanced Q):**

```ts
filter.Q.value = 3;
```
