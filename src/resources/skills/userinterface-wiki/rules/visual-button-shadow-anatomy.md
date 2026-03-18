---
title: Use Full Shadow Anatomy on Buttons
impact: HIGH
tags: visual, shadow, button, depth, gradient
---

## Use Full Shadow Anatomy on Buttons

A polished button uses six layered techniques, not just a single box-shadow.

1. **Outer cut shadow** — 0.5px dark box-shadow to "cut" the button into the surface
2. **Inner ambient highlight** — 1px inset box-shadow on all sides for environmental light reflections
3. **Inner top highlight** — 1px inset top highlight for the primary light source from above
4. **Layered depth shadows** — At least 3 external shadows for natural lighting
5. **Text drop-shadow** — Drop-shadow on text/icons for better contrast against the button background
6. **Subtle gradient background** — If you can tell there's a gradient, it's too much

**Incorrect (flat button):**

```css
.button {
  background: var(--gray-12);
  color: var(--gray-1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
```

**Correct (full shadow anatomy):**

```css
.button {
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--gray-12) 100%, white 4%),
    var(--gray-12)
  );
  color: var(--gray-1);
  box-shadow:
    0 0 0 0.5px rgba(0, 0, 0, 0.3),
    inset 0 0 0 1px rgba(255, 255, 255, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 1px 2px rgba(0, 0, 0, 0.1),
    0 2px 4px rgba(0, 0, 0, 0.06),
    0 4px 8px rgba(0, 0, 0, 0.03);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.15);
}
```

Reference: [@PixelJanitor](https://threadreaderapp.com/thread/1623358514440859649)
