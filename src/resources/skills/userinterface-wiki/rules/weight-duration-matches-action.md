---
title: Sound Duration Matches Action Duration
impact: MEDIUM
tags: weight, duration, action
---

## Sound Duration Matches Action Duration

Sound duration should match action duration.

**Incorrect (long sound for instant action):**

```tsx
function handleClick() {
  playSound("long-whoosh"); // 2000ms
}
```

**Correct (matched duration):**

```tsx
function handleClick() {
  playSound("click"); // 50ms
}

function handleUpload() {
  playSound("upload-progress"); // Matches upload duration
}
```
