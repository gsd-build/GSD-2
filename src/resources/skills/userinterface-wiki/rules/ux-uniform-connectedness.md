---
title: Visually Connect Related Elements
impact: MEDIUM
tags: ux, connectedness, grouping, visual
---

## Visually Connect Related Elements

Elements that are visually connected (by lines, color, or frames) are perceived as more related.

**Incorrect (steps with no visual connection):**

```tsx
function Steps({ current }) {
  return (
    <div>
      <span>Step 1</span>
      <span>Step 2</span>
      <span>Step 3</span>
    </div>
  );
}
```

**Correct (connected with a visual line):**

```tsx
function Steps({ current }) {
  return (
    <div className={styles.steps}>
      {steps.map((step, i) => (
        <div key={step.id} className={styles.step} data-active={i <= current}>
          <div className={styles.dot} />
          {i < steps.length - 1 && <div className={styles.connector} />}
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
}
```

Reference: [Law of Uniform Connectedness](https://lawsofux.com/law-of-uniform-connectedness/)
