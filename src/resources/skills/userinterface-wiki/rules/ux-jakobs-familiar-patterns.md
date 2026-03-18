---
title: Use Familiar UI Patterns
impact: HIGH
tags: ux, jakobs, familiarity, patterns
---

## Use Familiar UI Patterns

Users spend most of their time on other sites. They expect yours to work the same way (Jakob's Law).

**Incorrect (custom unconventional navigation):**

```tsx
function Nav() {
  return (
    <nav>
      <button onClick={() => navigate("/")}>⬡</button>
      <button onClick={() => navigate("/search")}>⬢</button>
    </nav>
  );
}
```

**Correct (standard recognizable patterns):**

```tsx
function Nav() {
  return (
    <nav>
      <Link href="/">Home</Link>
      <Link href="/search">Search</Link>
    </nav>
  );
}
```

Reference: [Jakob's Law](https://lawsofux.com/jakobs-law/)
