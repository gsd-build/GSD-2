---
title: Reuse Single AudioContext
impact: HIGH
tags: context, audio-context, singleton
---

## Reuse Single AudioContext

Reuse a single AudioContext instance; do not create new ones per sound.

**Incorrect (new context per call):**

```ts
function playSound() {
  const ctx = new AudioContext();
}
```

**Correct (singleton):**

```ts
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}
```
