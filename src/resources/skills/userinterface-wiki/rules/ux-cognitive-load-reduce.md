---
title: Minimize Extraneous Cognitive Load
impact: HIGH
tags: ux, cognitive-load, simplicity, noise
---

## Minimize Extraneous Cognitive Load

Remove anything that doesn't help the user complete their task. Decoration, redundant labels, and unnecessary options all add load.

**Incorrect (extraneous elements):**

```tsx
function DeleteDialog() {
  return (
    <dialog>
      <Icon name="warning" size={64} />
      <h2>Warning!</h2>
      <p>Are you absolutely sure you want to delete?</p>
      <p>This action is permanent and cannot be undone.</p>
      <p>All associated data will be lost forever.</p>
      <div>
        <button>Cancel</button>
        <button>Delete</button>
        <button>Learn More</button>
      </div>
    </dialog>
  );
}
```

**Correct (essential information only):**

```tsx
function DeleteDialog() {
  return (
    <dialog>
      <h2>Delete this item?</h2>
      <p>This can't be undone.</p>
      <div>
        <button>Cancel</button>
        <button>Delete</button>
      </div>
    </dialog>
  );
}
```

Reference: [Cognitive Load](https://lawsofux.com/cognitive-load/)
