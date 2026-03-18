---
title: Use Boundaries to Group Related Content
impact: MEDIUM
tags: ux, common-region, boundaries, grouping
---

## Use Boundaries to Group Related Content

Elements sharing a clearly defined boundary are perceived as a group.

**Incorrect (flat list with no visual grouping):**

```tsx
function Settings() {
  return (
    <div>
      <Toggle label="Dark mode" />
      <Toggle label="Notifications" />
      <Input label="Email" />
      <Input label="Password" />
    </div>
  );
}
```

**Correct (bounded sections):**

```tsx
function Settings() {
  return (
    <div>
      <section className={styles.group}>
        <h3>Appearance</h3>
        <Toggle label="Dark mode" />
      </section>
      <section className={styles.group}>
        <h3>Notifications</h3>
        <Toggle label="Notifications" />
      </section>
      <section className={styles.group}>
        <h3>Account</h3>
        <Input label="Email" />
        <Input label="Password" />
      </section>
    </div>
  );
}
```

Reference: [Law of Common Region](https://lawsofux.com/law-of-common-region/)
