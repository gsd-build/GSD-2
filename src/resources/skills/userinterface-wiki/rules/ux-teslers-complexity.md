---
title: Move Complexity, Don't Hide It
impact: MEDIUM
tags: ux, teslers, complexity, simplicity
---

## Move Complexity, Don't Hide It

Every system has irreducible complexity. The question is who handles it — the user or the system.

**Incorrect (complexity pushed to user):**

```tsx
<input
  type="text"
  placeholder="Enter date as YYYY-MM-DDTHH:mm:ss.sssZ"
/>
```

**Correct (system absorbs complexity):**

```tsx
<DatePicker
  onChange={(date) => setDate(date.toISOString())}
/>
```

Reference: [Tesler's Law](https://lawsofux.com/teslers-law/)
