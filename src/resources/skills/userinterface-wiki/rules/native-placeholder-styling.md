---
title: Use ::placeholder for Input Styling
impact: LOW
tags: native, placeholder, input
---

## Use ::placeholder for Input Styling

Use ::placeholder for input placeholder styling, not wrapper elements.

**Incorrect (custom placeholder node):**

```tsx
<div className={styles.inputWrapper}>
  {!value && <span className={styles.placeholder}>Enter text...</span>}
  <input value={value} />
</div>
```

**Correct (native ::placeholder):**

```css
input::placeholder {
  color: var(--gray-9);
  opacity: 1;
}
```
