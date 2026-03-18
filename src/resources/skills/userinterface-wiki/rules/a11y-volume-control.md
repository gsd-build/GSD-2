---
title: Independent Volume Control
impact: MEDIUM
tags: a11y, volume, settings
---

## Independent Volume Control

Allow volume adjustment independent of system volume.

**Incorrect (always full volume):**

```tsx
function playSound() {
  audio.volume = 1;
  audio.play();
}
```

**Correct (user-controlled volume):**

```tsx
function playSound() {
  const { volume } = usePreferences();
  audio.volume = volume;
  audio.play();
}
```
