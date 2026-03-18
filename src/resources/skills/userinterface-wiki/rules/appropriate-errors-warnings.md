---
title: Sound for Errors and Warnings
impact: MEDIUM
tags: appropriate, error, warning
---

## Sound for Errors and Warnings

Sound is appropriate for errors and warnings that can't be overlooked.

**Correct:**

```tsx
function handleError(error: Error) {
  playSound("error");
  showErrorToast(error.message);
}
```
