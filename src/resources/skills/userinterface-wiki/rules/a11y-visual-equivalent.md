---
title: Visual Equivalent for Every Sound
impact: HIGH
tags: a11y, visual, sound
---

## Visual Equivalent for Every Sound

Every audio cue must have a visual equivalent; sound never replaces visual feedback.

**Incorrect (sound without visual):**

```tsx
function SubmitButton({ onClick }) {
  const handleClick = () => {
    playSound("success");
    onClick();
  };
}
```

**Correct (sound with visual):**

```tsx
function SubmitButton({ onClick }) {
  const [status, setStatus] = useState("idle");
  
  const handleClick = () => {
    playSound("success");
    setStatus("success");
    onClick();
  };
  
  return <button data-status={status}>Submit</button>;
}
```
