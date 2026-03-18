# Rendering & UI Performance

## Grep/Glob Patterns to Detect

### React Re-render Issues
```
# Missing memoization
const\s+\w+\s*=\s*\(\s*\)\s*=>.*return\s*\(    (inline component definitions)
\w+\s*=\s*\{.*\}.*prop=                          (object literal as prop - new ref every render)
\w+\s*=\s*\[.*\].*prop=                          (array literal as prop)
\w+\s*=\s*\(\).*=>.*prop=                        (arrow function as prop - new ref every render)
style=\{\{                                        (inline style object)
# Context causing re-renders
useContext\(                                       (check context value stability)
<\w+Provider\s+value=\{\{                         (new object in Provider value)
<\w+Provider\s+value=\{[^}]*\}                    (unstable provider value)
# State management
useState\(.*\{                                     (object state - check if needs splitting)
setState\(.*\{\.\.\.state                          (spreading entire state on each update)
```

### Missing Virtualization
```
\.map\(.*<\w+                  (rendering list items - check list size)
{items\.map\(                  (JSX list rendering - check if >50 items)
\.map\(.*return.*<li           (list rendering without virtualization)
\.map\(.*return.*<tr           (table row rendering without virtualization)
\.map\(.*return.*<div          (div list - check count)
v-for=                         (Vue list rendering)
ngFor                          (Angular list rendering)
```

### Layout Thrashing
```
offsetWidth.*style\.           (read then write in sequence)
offsetHeight.*style\.          (read then write)
getBoundingClientRect.*style   (read then write)
clientWidth.*className         (read then class change)
scrollTop.*style               (read then write)
\.style\..*\.style\.           (multiple style writes - batch with class)
```

### Large DOM
```
document\.createElement.*loop  (creating elements in loop)
innerHTML\s*\+=                (innerHTML concatenation - causes reparse)
\.appendChild\(.*loop          (appending in loop without fragment)
document\.querySelector\(.*loop (DOM query in loop)
\$\(.*\).*loop                 (jQuery selector in loop)
```

### Missing Lazy Loading
```
<img\s+(?!.*loading)           (images without loading="lazy")
<iframe\s+(?!.*loading)        (iframes without lazy loading)
import.*above.*fold            (heavy imports for below-fold content)
```

### Animation Performance
```
# Layout-triggering animations
animate.*width                 (animating width triggers layout)
animate.*height                (animating height triggers layout)
animate.*top                   (animating top triggers layout)
animate.*left                  (animating left triggers layout)
animate.*margin                (animating margin triggers layout)
transition.*width              (transitioning layout properties)
transition.*height
# Should use transform/opacity instead
@keyframes.*\{.*(?:width|height|top|left|margin|padding)
```

### SSR/Hydration Issues
```
useEffect\(.*\[\].*setState   (client-side data fetch causing hydration mismatch)
typeof window                  (window checks indicating SSR issues)
document\.                     (direct document access in components)
window\.                       (direct window access in components)
```

## Improvement Strategies

1. **Re-renders**: Use React.memo, useMemo, useCallback for stable references
2. **Context**: Split contexts by update frequency, memoize provider values
3. **Virtualization**: Use react-window/react-virtuoso for lists > 50 items
4. **Layout thrashing**: Batch reads, then batch writes; use requestAnimationFrame
5. **DOM manipulation**: Use DocumentFragment, batch insertions, avoid innerHTML +=
6. **Lazy loading**: Add loading="lazy" to images/iframes, use Intersection Observer
7. **Animations**: Only animate transform and opacity (GPU-composited properties)
8. **SSR**: Pre-fetch data server-side, avoid hydration mismatches
