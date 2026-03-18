---
title: Show Incomplete State to Drive Completion
impact: MEDIUM
tags: ux, zeigarnik, incomplete, engagement
---

## Show Incomplete State to Drive Completion

People remember incomplete tasks better than completed ones. Use this to drive engagement.

**Incorrect (no indication of incomplete profile):**

```tsx
function Dashboard() {
  return <DashboardContent />;
}
```

**Correct (incomplete state visible):**

```tsx
function Dashboard({ profile }) {
  return (
    <div>
      {!profile.isComplete && (
        <Banner>
          Complete your profile — {profile.completionPercent}% done
        </Banner>
      )}
      <DashboardContent />
    </div>
  );
}
```

Reference: [Zeigarnik Effect](https://lawsofux.com/zeigarnik-effect/)
