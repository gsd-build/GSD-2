---
title: Make Important Elements Visually Distinct
impact: HIGH
tags: ux, von-restorff, emphasis, distinction
---

## Make Important Elements Visually Distinct

When multiple similar elements are present, the one that differs is most likely to be remembered.

**Incorrect (primary action blends in):**

```tsx
<div className={styles.actions}>
  <button className={styles.button}>Cancel</button>
  <button className={styles.button}>Delete Account</button>
</div>
```

**Correct (destructive action stands out):**

```tsx
<div className={styles.actions}>
  <button className={styles["button-secondary"]}>Cancel</button>
  <button className={styles["button-danger"]}>Delete Account</button>
</div>
```

Reference: [Von Restorff Effect](https://lawsofux.com/von-restorff-effect/)
