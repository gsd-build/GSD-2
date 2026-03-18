---
title: useIsPresent in Child Component
impact: HIGH
tags: presence, hook, component-hierarchy
---

## useIsPresent in Child Component

useIsPresent must be called from child of AnimatePresence, not parent.

**Incorrect (hook in parent):**

```tsx
function Parent() {
  const isPresent = useIsPresent();
  return (
    <AnimatePresence>
      {show && <Child />}
    </AnimatePresence>
  );
}
```

**Correct (hook in child):**

```tsx
function Child() {
  const isPresent = useIsPresent();
  return <motion.div data-exiting={!isPresent} />;
}
```
