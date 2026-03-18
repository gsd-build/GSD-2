---
title: Press and Hover 120-180ms
impact: MEDIUM
tags: duration, press, hover
---

## Press and Hover 120-180ms

Press and hover interactions should use 120-180ms duration.

**Incorrect (too slow):**

```css
.button:hover { transition: background-color 400ms; }
```

**Correct (appropriate duration):**

```css
.button:hover { transition: background-color 150ms; }
```
