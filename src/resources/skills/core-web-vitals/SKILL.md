---
name: core-web-vitals
description: Optimize Core Web Vitals (LCP, INP, CLS) for better page experience and search ranking. Use when asked to "improve Core Web Vitals", "fix LCP", "reduce CLS", "optimize INP", "page experience optimization", or "fix layout shifts".
license: MIT
metadata:
  author: web-quality-skills
  version: "1.0"
---

# Core Web Vitals optimization

Targeted optimization for the three Core Web Vitals metrics that affect Google Search ranking and user experience.

## The three metrics

| Metric | Measures | Good | Needs work | Poor |
|--------|----------|------|------------|------|
| **LCP** | Loading | ≤ 2.5s | 2.5s – 4s | > 4s |
| **INP** | Interactivity | ≤ 200ms | 200ms – 500ms | > 500ms |
| **CLS** | Visual Stability | ≤ 0.1 | 0.1 – 0.25 | > 0.25 |

Google measures at the **75th percentile** — 75% of page visits must meet "Good" thresholds.

---

## LCP: Largest Contentful Paint

LCP measures when the largest visible content element renders (hero image, large text block, background image, or SVG).

### Common LCP issues

**1. Slow server response:** Target TTFB < 800ms. Fix with CDN, caching, optimized backend, edge rendering.

**2. Render-blocking resources:**
- ❌ `<link rel="stylesheet" href="/all-styles.css">` — blocks rendering
- ✅ Inline critical CSS + `<link rel="preload" href="/styles.css" as="style" onload="this.rel='stylesheet'">`

**3. Slow resource load times:**
- ❌ `<img src="/hero.jpg">` — no hints, discovered late
- ✅ `<link rel="preload" href="/hero.webp" as="image" fetchpriority="high">` + `fetchpriority="high"` on img

**4. Client-side rendering delays:**
- ❌ Fetching LCP content in `useEffect` — ✅ Use SSR/SSG/streaming to include content in initial HTML

### LCP optimization checklist

- [ ] TTFB < 800ms (use CDN, edge caching)
- [ ] LCP image preloaded with fetchpriority="high"
- [ ] LCP image optimized (WebP/AVIF, correct size)
- [ ] Critical CSS inlined (< 14KB)
- [ ] No render-blocking JavaScript in `<head>`
- [ ] Fonts: `font-display: swap`
- [ ] LCP element in initial HTML (not JS-rendered)

### LCP element identification
```javascript
new PerformanceObserver((list) => {
  const entry = list.getEntries().at(-1);
  console.log('LCP element:', entry.element, 'Time:', entry.startTime);
}).observe({ type: 'largest-contentful-paint', buffered: true });
```

---

## INP: Interaction to Next Paint

INP measures responsiveness across ALL interactions (clicks, taps, key presses). Reports worst interaction (98th percentile for high-traffic pages).

### INP breakdown

Total INP = **Input Delay** (< 50ms) + **Processing Time** (< 100ms) + **Presentation Delay** (< 50ms)

### Common INP issues

**1. Long tasks blocking main thread:**
```javascript
// ❌ Long synchronous loop — ✅ Break into chunks with yielding:
async function processLargeArray(items) {
  for (let i = 0; i < items.length; i += 100) {
    items.slice(i, i + 100).forEach(item => expensiveOperation(item));
    await new Promise(r => setTimeout(r, 0)); // yield to main thread
  }
}
```

**2. Heavy event handlers:**
```javascript
// ✅ Prioritize visual feedback, defer rest
button.addEventListener('click', () => {
  button.classList.add('loading'); // immediate feedback
  requestAnimationFrame(() => updateUI(calculateComplexThing()));
  requestIdleCallback(() => trackEvent('click')); // non-critical
});
```

**3. Third-party scripts:**
- ❌ `<script src="https://heavy-widget.com/widget.js">` — blocks interactions
- ✅ Lazy load: `button.addEventListener('click', () => import('widget.js').then(w => w.init()), { once: true })`

**4. Excessive re-renders (React):**
- ❌ Expensive component re-renders on unrelated state — ✅ `React.memo(ExpensiveComponent)`

### INP optimization checklist

- [ ] No tasks > 50ms on main thread
- [ ] Event handlers complete quickly (< 100ms)
- [ ] Visual feedback provided immediately
- [ ] Heavy work deferred with requestIdleCallback
- [ ] Third-party scripts don't block interactions
- [ ] Debounced input handlers where appropriate
- [ ] Web Workers for CPU-intensive operations

### INP debugging
```javascript
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 200) console.warn('Slow interaction:', entry.name, entry.duration + 'ms', entry.target);
  }
}).observe({ type: 'event', buffered: true, durationThreshold: 16 });
```

---

## CLS: Cumulative Layout Shift

CLS measures unexpected layout shifts. Formula: `impact fraction x distance fraction`

### Common CLS causes

**1. Images without dimensions:**
- ❌ `<img src="photo.jpg">` — shifts on load
- ✅ `<img src="photo.jpg" width="800" height="600">` or `style="aspect-ratio: 4/3; width: 100%"`

**2. Ads, embeds, iframes:**
- ❌ `<iframe src="ad">` — unknown size
- ✅ Wrap in container: `<div style="min-height: 250px">` or `style="aspect-ratio: 16/9"`

**3. Dynamically injected content:** Insert below viewport, or animate in with `transform` to avoid shifting.

**4. Web fonts causing FOUT:**
```css
/* ✅ No shift if slow */
@font-face { font-family: 'Custom'; src: url('custom.woff2') format('woff2'); font-display: optional; }
/* ✅ Or match fallback metrics */
@font-face { font-family: 'Custom'; src: url('custom.woff2') format('woff2');
  font-display: swap; size-adjust: 105%; ascent-override: 95%; descent-override: 20%; }
```

**5. Animations triggering layout:**
- ❌ `transition: height 0.3s, width 0.3s` — ✅ `transition: transform 0.3s` (use transform/opacity only)

### CLS optimization checklist

- [ ] All images have width/height or aspect-ratio
- [ ] All videos/embeds have reserved space
- [ ] Ads have min-height containers
- [ ] Fonts use font-display: optional or matched metrics
- [ ] Dynamic content inserted below viewport
- [ ] Animations use transform/opacity only
- [ ] No content injected above existing content

### CLS debugging
```javascript
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (!entry.hadRecentInput) {
      console.log('Layout shift:', entry.value);
      entry.sources?.forEach(s => console.log('  Shifted:', s.node, s.previousRect, '->', s.currentRect));
    }
  }
}).observe({ type: 'layout-shift', buffered: true });
```

---

## Measurement tools

### Lab testing
- **Chrome DevTools** → Performance panel, Lighthouse
- **WebPageTest** → Detailed waterfall, filmstrip
- **Lighthouse CLI** → `npx lighthouse <url>`

### Field data (real users)
- **CrUX** → BigQuery or API | **Search Console** → Core Web Vitals report

```javascript
import {onLCP, onINP, onCLS} from 'web-vitals';
function sendToAnalytics({name, value, rating}) {
  gtag('event', name, { event_category: 'Web Vitals',
    value: Math.round(name === 'CLS' ? value * 1000 : value), event_label: rating });
}
onLCP(sendToAnalytics); onINP(sendToAnalytics); onCLS(sendToAnalytics);
```

---

## Framework quick fixes

### Next.js
- LCP: `<Image src="/hero.jpg" priority fill alt="Hero" />`
- INP: `const Heavy = dynamic(() => import('./Heavy'), { ssr: false })`
- CLS: `next/image` handles dimensions automatically

### React
- LCP: `<link rel="preload" href="/hero.jpg" as="image" fetchpriority="high" />`
- INP: `const [isPending, startTransition] = useTransition(); startTransition(() => setState(val))`
- CLS: Always specify width/height on img tags

### Vue/Nuxt
- LCP: `<NuxtImg src="/hero.jpg" preload loading="eager" />`
- INP: `<component :is="() => import('./Heavy.vue')" />`
- CLS: Use `aspect-ratio` CSS on images

## References

- [web.dev LCP](https://web.dev/articles/lcp)
- [web.dev INP](https://web.dev/articles/inp)
- [web.dev CLS](https://web.dev/articles/cls)
- [Code Optimizer skill](../code-optimizer/SKILL.md)
