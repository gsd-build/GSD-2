---
title: Clean Up Audio Nodes After Playback
impact: MEDIUM
tags: context, cleanup, disconnect
---

## Clean Up Audio Nodes After Playback

Disconnect and clean up audio nodes after playback.

**Incorrect (nodes remain connected):**

```ts
source.start();
```

**Correct (cleaned up on end):**

```ts
source.start();
source.onended = () => {
  source.disconnect();
  gain.disconnect();
};
```
