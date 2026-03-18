---
title: No Sound on High-Frequency Interactions
impact: HIGH
tags: appropriate, frequency, typing
---

## No Sound on High-Frequency Interactions

Do not add sound to high-frequency interactions (typing, keyboard navigation).

**Incorrect (sound on every keystroke):**

```tsx
function Input({ onChange }) {
  const handleChange = (e) => {
    playSound("keystroke");
    onChange(e);
  };
}
```

**Correct (no sound on typing):**

```tsx
function Input({ onChange }) {
  return <input onChange={onChange} />;
}
```
