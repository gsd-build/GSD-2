---
title: Use ResizeObserver for Measurement
impact: MEDIUM
tags: container, resize-observer, performance
---

## Use ResizeObserver for Measurement

Use ResizeObserver to track element dimensions. It fires on resize without causing layout thrashing.

**Incorrect (measuring on every render):**

```tsx
function useMeasure(ref) {
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setBounds({ width: rect.width, height: rect.height });
    }
  });
  return bounds;
}
```

**Correct (ResizeObserver):**

```tsx
function useMeasure() {
  const [element, setElement] = useState(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const ref = useCallback((node) => setElement(node), []);

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setBounds({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [ref, bounds];
}
```
