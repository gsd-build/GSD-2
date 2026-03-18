---
title: Prioritize the Critical 20% of Features
impact: MEDIUM
tags: ux, pareto, prioritization, features
---

## Prioritize the Critical 20% of Features

80% of users use 20% of features (Pareto Principle). Optimize the critical path first.

**Incorrect (all features equally prominent):**

```tsx
function Toolbar() {
  return (
    <div>
      {allFeatures.map(f => <Button key={f.id}>{f.label}</Button>)}
    </div>
  );
}
```

**Correct (critical features prominent, rest accessible):**

```tsx
function Toolbar() {
  return (
    <div>
      {criticalFeatures.map(f => <Button key={f.id}>{f.label}</Button>)}
      <MoreMenu features={secondaryFeatures} />
    </div>
  );
}
```

Reference: [Pareto Principle](https://lawsofux.com/pareto-principle/)
