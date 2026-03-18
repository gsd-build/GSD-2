---
title: No Animation for High-Frequency Interactions
impact: HIGH
tags: none, high-frequency, performance
---

## No Animation for High-Frequency Interactions

High-frequency interactions should have no animation.

**Incorrect (animated on every keystroke):**

```tsx
function SearchInput() {
  return (
    <motion.div animate={{ scale: [1, 1.02, 1] }}>
      <input onChange={handleSearch} />
    </motion.div>
  );
}
```

**Correct (no animation):**

```tsx
function SearchInput() {
  return <input onChange={handleSearch} />;
}
```
