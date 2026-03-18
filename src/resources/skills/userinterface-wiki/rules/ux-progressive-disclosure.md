---
title: Show What Matters Now, Reveal Complexity Later
impact: HIGH
tags: ux, progressive-disclosure, complexity
---

## Show What Matters Now, Reveal Complexity Later

Don't overwhelm users with everything at once. Reveal complexity incrementally as needed.

**Incorrect (all controls visible):**

```tsx
function Editor() {
  return (
    <div>
      <BasicTools />
      <AdvancedTools />
      <ExpertTools />
      <DebugTools />
    </div>
  );
}
```

**Correct (progressive disclosure):**

```tsx
function Editor() {
  const [showAdvanced, setShowAdvanced] = useState(false);
  return (
    <div>
      <BasicTools />
      {showAdvanced && <AdvancedTools />}
      <button onClick={() => setShowAdvanced(!showAdvanced)}>
        Toggle
      </button>
    </div>
  );
}
```
