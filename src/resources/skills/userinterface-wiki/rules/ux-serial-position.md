---
title: Place Key Items First or Last
impact: MEDIUM
tags: ux, serial-position, navigation, order
---

## Place Key Items First or Last

Users best remember the first and last items in a sequence. Place the most important actions at these positions.

**Incorrect (important action buried in middle):**

```tsx
<nav>
  <Link href="/settings">Settings</Link>
  <Link href="/">Home</Link>
  <Link href="/about">About</Link>
</nav>
```

**Correct (key items at edges):**

```tsx
<nav>
  <Link href="/">Home</Link>
  <Link href="/about">About</Link>
  <Link href="/settings">Settings</Link>
</nav>
```

Reference: [Serial Position Effect](https://lawsofux.com/serial-position-effect/)
