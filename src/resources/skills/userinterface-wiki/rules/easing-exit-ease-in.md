---
title: Ease-In for Exits
impact: HIGH
tags: easing, exit, ease-in
---

## Ease-In for Exits

Exits must use ease-in (build momentum before departure).

**Incorrect (ease-out for exit):**

```css
.modal-exit { animation-timing-function: ease-out; }
```

**Correct (ease-in for exit):**

```css
.modal-exit { animation-timing-function: ease-in; }
```
