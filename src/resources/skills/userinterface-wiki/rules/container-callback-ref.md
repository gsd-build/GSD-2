---
title: Use Callback Ref for Measurement
impact: MEDIUM
tags: container, ref, callback
---

## Use Callback Ref for Measurement

Use a callback ref (not useRef) for measurement hooks so the observer attaches when the DOM node is ready.

**Incorrect (useRef may be null on first effect):**

```tsx
const ref = useRef(null);
useEffect(() => {
  if (!ref.current) return;
  observer.observe(ref.current);
}, []);
```

**Correct (callback ref guarantees node):**

```tsx
const [element, setElement] = useState(null);
const ref = useCallback((node) => setElement(node), []);
useEffect(() => {
  if (!element) return;
  observer.observe(element);
  return () => observer.disconnect();
}, [element]);
```
