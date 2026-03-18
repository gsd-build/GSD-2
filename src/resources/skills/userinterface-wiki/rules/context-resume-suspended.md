---
title: Resume Suspended AudioContext
impact: HIGH
tags: context, resume, suspended
---

## Resume Suspended AudioContext

Check and resume suspended AudioContext before playing.

**Incorrect (plays without checking):**

```ts
function playSound() {
  const ctx = getAudioContext();
}
```

**Correct (resumes if suspended):**

```ts
function playSound() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    ctx.resume();
  }
}
```
