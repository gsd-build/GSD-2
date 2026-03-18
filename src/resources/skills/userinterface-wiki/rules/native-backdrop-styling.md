---
title: Use ::backdrop for Dialog Backgrounds
impact: MEDIUM
tags: native, backdrop, dialog
---

## Use ::backdrop for Dialog Backgrounds

Use ::backdrop pseudo-element for dialog/popover backgrounds.

**Incorrect (extra overlay node):**

```tsx
<>
  <div className={styles.overlay} onClick={close} />
  <dialog className={styles.dialog}>{children}</dialog>
</>
```

**Correct (native ::backdrop):**

```css
dialog::backdrop {
  background: var(--black-a6);
  backdrop-filter: blur(4px);
}
```
