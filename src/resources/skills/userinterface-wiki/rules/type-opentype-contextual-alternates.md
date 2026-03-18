---
title: Enable Contextual Alternates
impact: MEDIUM
tags: type, opentype, calt
---

## Enable Contextual Alternates

Keep contextual alternates enabled (calt). They adjust punctuation and glyph shapes based on surrounding characters.

**Correct (usually on by default, don't disable):**

```css
body { font-feature-settings: "calt" 1; }
```
