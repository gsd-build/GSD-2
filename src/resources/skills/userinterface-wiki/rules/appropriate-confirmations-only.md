---
title: Sound for Confirmations
impact: MEDIUM
tags: appropriate, confirmation, payment
---

## Sound for Confirmations

Sound is appropriate for confirmations: payments, uploads, form submissions.

**Correct:**

```tsx
async function handlePayment() {
  await processPayment();
  playSound("success");
  showConfirmation();
}
```
