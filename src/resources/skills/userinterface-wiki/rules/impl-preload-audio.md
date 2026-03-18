---
title: Preload Audio Files
impact: MEDIUM
tags: impl, preload, performance
---

## Preload Audio Files

Preload audio files to avoid playback delay.

**Incorrect (loads on demand):**

```tsx
function playSound(name: string) {
  const audio = new Audio(`/sounds/${name}.mp3`);
  audio.play();
}
```

**Correct (preloaded):**

```tsx
const sounds = {
  success: new Audio("/sounds/success.mp3"),
  error: new Audio("/sounds/error.mp3"),
};

Object.values(sounds).forEach(audio => audio.load());

function playSound(name: keyof typeof sounds) {
  sounds[name].currentTime = 0;
  sounds[name].play();
}
```
