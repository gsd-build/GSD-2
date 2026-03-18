---
title: Match Sound Weight to Action
impact: MEDIUM
tags: weight, action, importance
---

## Match Sound Weight to Action

Sound weight should match action importance.

**Incorrect (fanfare for toggle):**

```tsx
function handleToggle() {
  playSound("triumphant-fanfare");
  setEnabled(!enabled);
}
```

**Correct (weight matches action):**

```tsx
function handleToggle() {
  playSound("soft-click");
  setEnabled(!enabled);
}

function handlePurchase() {
  playSound("success-chime");
  completePurchase();
}
```
