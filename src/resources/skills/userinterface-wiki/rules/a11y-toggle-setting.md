---
title: Toggle Setting to Disable Sounds
impact: HIGH
tags: a11y, settings, toggle
---

## Toggle Setting to Disable Sounds

Provide explicit toggle to disable sounds in settings.

**Incorrect (no way to disable):**

```tsx
function App() {
  return <SoundProvider>{children}</SoundProvider>;
}
```

**Correct (toggle available):**

```tsx
function App() {
  const { soundEnabled } = usePreferences();
  return (
    <SoundProvider enabled={soundEnabled}>
      {children}
    </SoundProvider>
  );
}
```
