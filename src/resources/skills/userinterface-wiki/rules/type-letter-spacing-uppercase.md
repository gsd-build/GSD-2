---
title: Add Letter Spacing to Uppercase Text
impact: MEDIUM
tags: type, letter-spacing, uppercase, small-caps
---

## Add Letter Spacing to Uppercase Text

Uppercase and small-caps text needs positive letter-spacing to feel open and readable.

**Incorrect (tight uppercase):**

```css
.label {
  text-transform: uppercase;
  font-size: 12px;
}
```

**Correct (opened up):**

```css
.label {
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.05em;
}
```
