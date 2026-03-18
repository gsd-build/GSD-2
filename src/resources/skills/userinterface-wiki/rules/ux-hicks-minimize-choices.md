---
title: Minimize Choices to Reduce Decision Time
impact: HIGH
tags: ux, hicks, choices, cognitive-load
---

## Minimize Choices to Reduce Decision Time

Decision time increases logarithmically with the number of choices. Use progressive disclosure.

**Incorrect (all options at once):**

```tsx
function Settings() {
  return (
    <div>
      {allSettings.map(setting => (
        <SettingRow key={setting.id} {...setting} />
      ))}
    </div>
  );
}
```

**Correct (progressive disclosure):**

```tsx
function Settings() {
  return (
    <div>
      {commonSettings.map(setting => (
        <SettingRow key={setting.id} {...setting} />
      ))}
      <details>
        <summary>Advanced</summary>
        {advancedSettings.map(setting => (
          <SettingRow key={setting.id} {...setting} />
        ))}
      </details>
    </div>
  );
}
```

Reference: Hick, W. E. (1952). On the rate of gain of information.
