---
title: Reset currentTime Before Replay
impact: MEDIUM
tags: impl, replay, current-time
---

## Reset currentTime Before Replay

Reset audio currentTime before replay to allow rapid triggering.

**Incorrect (won't replay if playing):**

```tsx
function playSound() {
  audio.play();
}
```

**Correct (reset before play):**

```tsx
function playSound() {
  audio.currentTime = 0;
  audio.play();
}
```
