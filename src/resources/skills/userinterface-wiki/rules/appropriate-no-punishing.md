---
title: Informative Not Punishing Sound
impact: MEDIUM
tags: appropriate, error, tone
---

## Informative Not Punishing Sound

Sound should inform, not punish; avoid harsh sounds for user mistakes.

**Incorrect (harsh buzzer):**

```tsx
function ValidationError() {
  playSound("loud-buzzer");
  return <span>Invalid input</span>;
}
```

**Correct (gentle alert):**

```tsx
function ValidationError() {
  playSound("gentle-alert");
  return <span>Invalid input</span>;
}
```
