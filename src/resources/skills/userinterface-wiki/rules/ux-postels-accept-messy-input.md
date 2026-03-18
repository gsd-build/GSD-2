---
title: Accept Messy Input, Output Clean Data
impact: MEDIUM
tags: ux, postels, input, validation
---

## Accept Messy Input, Output Clean Data

Inputs should accept messy human data and normalize it. Validate generously, format strictly.

**Incorrect (rigid format required):**

```tsx
function DateInput({ onChange }) {
  return (
    <input
      type="text"
      placeholder="YYYY-MM-DD"
      pattern="\d{4}-\d{2}-\d{2}"
      onChange={onChange}
    />
  );
}
```

**Correct (accepts multiple formats):**

```tsx
function DateInput({ onChange }) {
  function handleChange(e) {
    const parsed = parseFlexibleDate(e.target.value);
    if (parsed) onChange(parsed);
  }

  return (
    <input
      type="text"
      placeholder="Any date format"
      onChange={handleChange}
    />
  );
}
```

Reference: Postel, J. (1980). RFC 761 — Transmission Control Protocol.
