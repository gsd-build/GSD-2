---
title: Fake Speed When Actual Speed Isn't Possible
impact: HIGH
tags: ux, doherty, perceived-speed, skeleton
---

## Fake Speed When Actual Speed Isn't Possible

If you can't make something fast, make it feel fast with optimistic UI, skeletons, or progress indicators.

**Incorrect (blank screen during load):**

```tsx
function Page() {
  const { data, isLoading } = useFetch("/api/data");
  if (isLoading) return null;
  return <Content data={data} />;
}
```

**Correct (skeleton during load):**

```tsx
function Page() {
  const { data, isLoading } = useFetch("/api/data");
  if (isLoading) return <Skeleton />;
  return <Content data={data} />;
}
```
