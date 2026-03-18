---
title: Show Progress Toward Completion
impact: HIGH
tags: ux, goal-gradient, progress, motivation
---

## Show Progress Toward Completion

People accelerate behavior as they approach a goal. Show how close they are to finishing.

**Incorrect (no sense of progress):**

```tsx
function Onboarding({ step }) {
  return <OnboardingStep step={step} />;
}
```

**Correct (progress visible):**

```tsx
function Onboarding({ step, totalSteps }) {
  return (
    <div>
      <ProgressBar value={step} max={totalSteps} />
      <span>Step {step} of {totalSteps}</span>
      <OnboardingStep step={step} />
    </div>
  );
}
```

Reference: [Goal-Gradient Effect](https://lawsofux.com/goal-gradient-effect/)
