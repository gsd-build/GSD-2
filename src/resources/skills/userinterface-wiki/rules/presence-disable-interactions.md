---
title: Disable Interactions on Exiting Elements
impact: MEDIUM
tags: presence, interaction, exit
---

## Disable Interactions on Exiting Elements

Disable interactions on exiting elements using isPresent.

**Incorrect (clickable during exit):**

```tsx
function Card() {
  const isPresent = useIsPresent();
  return <button onClick={handleClick}>Click</button>;
}
```

**Correct (disabled during exit):**

```tsx
function Card() {
  const isPresent = useIsPresent();
  return (
    <button onClick={handleClick} disabled={!isPresent}>
      Click
    </button>
  );
}
```
