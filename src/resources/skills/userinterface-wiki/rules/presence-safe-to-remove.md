---
title: Call safeToRemove After Async Work
impact: HIGH
tags: presence, safe-to-remove, async
---

## Call safeToRemove After Async Work

When using usePresence, always call safeToRemove after async work.

**Incorrect (missing safeToRemove):**

```tsx
function AsyncComponent() {
  const [isPresent, safeToRemove] = usePresence();

  useEffect(() => {
    if (!isPresent) {
      cleanup();
    }
  }, [isPresent]);
}
```

**Correct (safeToRemove called):**

```tsx
function AsyncComponent() {
  const [isPresent, safeToRemove] = usePresence();

  useEffect(() => {
    if (!isPresent) {
      cleanup().then(safeToRemove);
    }
  }, [isPresent, safeToRemove]);
}
```
