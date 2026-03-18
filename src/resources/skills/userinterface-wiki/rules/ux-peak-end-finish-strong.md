---
title: End Experiences with Clear Success States
impact: MEDIUM
tags: ux, peak-end, success, completion
---

## End Experiences with Clear Success States

People judge experiences by their peak moment and their end. Invest in success and completion states.

**Incorrect (abrupt end after action):**

```tsx
async function handleSubmit() {
  await submitForm(data);
  router.push("/");
}
```

**Correct (satisfying completion state):**

```tsx
async function handleSubmit() {
  await submitForm(data);
  setStatus("success");
}

return status === "success" ? (
  <SuccessScreen message="You're all set." />
) : (
  <Form onSubmit={handleSubmit} />
);
```

Reference: [Peak-End Rule](https://lawsofux.com/peak-end-rule/)
