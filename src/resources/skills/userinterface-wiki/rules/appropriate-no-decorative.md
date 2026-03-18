---
title: No Decorative Sound
impact: MEDIUM
tags: appropriate, decorative, hover
---

## No Decorative Sound

Do not add sound to decorative moments with no informational value.

**Incorrect (hover sound):**

```tsx
function Card({ onHover }) {
  return (
    <div onMouseEnter={() => playSound("hover")}>
      {children}
    </div>
  );
}
```
