---
name: userinterface-wiki
description: UI/UX best practices for web interfaces. Use when reviewing animations, CSS, audio, typography, UX patterns, prefetching, or icon implementations. Covers 11 categories from animation principles to typography. Outputs file:line findings.
license: MIT
metadata:
  author: raphael-salaja
  version: "3.0.0"
---

# User Interface Wiki

Comprehensive UI/UX best practices guide for web interfaces. Contains 152 rules across 12 categories, prioritized by impact to guide automated code review and generation.

## When to Apply

Reference these guidelines when:
- Implementing or reviewing animations (CSS transitions, Motion/Framer Motion)
- Choosing between springs, easing curves, or no animation
- Working with AnimatePresence and exit animations
- Writing CSS with pseudo-elements or View Transitions API
- Adding audio feedback or procedural sound to UI
- Building morphing icon components
- Animating container width/height with dynamic content
- Designing UI that respects cognitive psychology (Fitts's, Hick's, Miller's laws)
- Implementing predictive prefetching for perceived performance
- Setting up typography, OpenType features, or numeric formatting

## Rule Categories by Priority

| Priority | Category | Impact | Prefixes |
|----------|----------|--------|----------|
| 1 | Animation Principles | CRITICAL | `timing-`, `physics-`, `staging-` |
| 2 | Timing Functions | HIGH | `spring-`, `easing-`, `duration-`, `none-` |
| 3 | Exit Animations | HIGH | `exit-`, `presence-`, `mode-`, `nested-` |
| 4 | CSS Pseudo Elements | MEDIUM | `pseudo-`, `transition-`, `native-` |
| 5 | Audio Feedback | MEDIUM | `a11y-`, `appropriate-`, `impl-`, `weight-` |
| 6 | Sound Synthesis | MEDIUM | `context-`, `envelope-`, `design-`, `param-` |
| 7 | Morphing Icons | LOW | `morphing-` |
| 8 | Container Animation | MEDIUM | `container-` |
| 9 | Laws of UX | HIGH | `ux-` |
| 10 | Predictive Prefetching | MEDIUM | `prefetch-` |
| 11 | Typography | MEDIUM | `type-` |
| 12 | Visual Design | HIGH | `visual-` |

## Quick Reference

### 1. Animation Principles (CRITICAL)

- `timing-under-300ms` - User animations must complete within 300ms
- `timing-consistent` - Similar elements use identical timing values
- `timing-no-entrance-context-menu` - Context menus: no entrance animation, exit only
- `easing-natural-decay` - Use exponential ramps for natural decay, not linear
- `easing-no-linear-motion` - Linear easing only for progress indicators
- `physics-active-state` - Interactive elements need :active scale transform
- `physics-subtle-deformation` - Squash/stretch in 0.95-1.05 range
- `physics-spring-for-overshoot` - Springs for overshoot-and-settle, not easing
- `physics-no-excessive-stagger` - Stagger delays under 50ms per item
- `staging-one-focal-point` - One prominent animation at a time
- `staging-dim-background` - Dim modal/dialog backgrounds
- `staging-z-index-hierarchy` - Animated elements respect z-index layers

### 2. Timing Functions (HIGH)

- `spring-for-gestures` - Gesture-driven motion (drag, flick) must use springs
- `spring-for-interruptible` - Interruptible motion must use springs
- `spring-preserves-velocity` - Springs preserve input energy on release
- `spring-params-balanced` - Avoid excessive oscillation in spring params
- `easing-for-state-change` - System state changes use easing curves
- `easing-entrance-ease-out` - Entrances use ease-out
- `easing-exit-ease-in` - Exits use ease-in
- `easing-transition-ease-in-out` - View transitions use ease-in-out
- `easing-linear-only-progress` - Linear only for progress/time representation
- `duration-press-hover` - Press/hover: 120-180ms
- `duration-small-state` - Small state changes: 180-260ms
- `duration-max-300ms` - User-initiated max 300ms
- `duration-shorten-before-curve` - Fix slow feel with shorter duration, not curve
- `none-high-frequency` - No animation for high-frequency interactions
- `none-keyboard-navigation` - Keyboard navigation instant, no animation
- `none-context-menu-entrance` - Context menus: no entrance, exit only

### 3. Exit Animations (HIGH)

- `exit-requires-wrapper` - Conditional motion elements need AnimatePresence wrapper
- `exit-prop-required` - Elements in AnimatePresence need exit prop
- `exit-key-required` - Dynamic lists need unique keys, not index
- `exit-matches-initial` - Exit mirrors initial for symmetry
- `presence-hook-in-child` - useIsPresent in child, not parent
- `presence-safe-to-remove` - Call safeToRemove after async cleanup
- `presence-disable-interactions` - Disable interactions on exiting elements
- `mode-wait-doubles-duration` - Mode "wait" doubles duration; halve timing
- `mode-sync-layout-conflict` - Mode "sync" causes layout conflicts
- `mode-pop-layout-for-lists` - Use popLayout for list reordering
- `nested-propagate-required` - Nested AnimatePresence needs propagate prop
- `nested-consistent-timing` - Coordinate parent-child exit durations

### 4. CSS Pseudo Elements (MEDIUM)

- `pseudo-content-required` - ::before/::after need content property
- `pseudo-over-dom-node` - Pseudo-elements over extra DOM nodes for decoration
- `pseudo-position-relative-parent` - Parent needs position: relative
- `pseudo-z-index-layering` - Z-index for correct pseudo-element layering
- `pseudo-hit-target-expansion` - Negative inset for larger hit targets
- `pseudo-marker-styling` - Use ::marker for custom list bullet styles
- `pseudo-first-line-styling` - Use ::first-line for typographic treatments
- `transition-name-required` - View transitions need view-transition-name
- `transition-name-unique` - Each transition name unique during transition
- `transition-name-cleanup` - Remove transition name after completion
- `transition-over-js-library` - Prefer View Transitions API over JS libraries
- `transition-style-pseudo-elements` - Style ::view-transition-group for custom animations
- `native-backdrop-styling` - Use ::backdrop for dialog backgrounds
- `native-placeholder-styling` - Use ::placeholder for input styling
- `native-selection-styling` - Use ::selection for text selection styling

### 5. Audio Feedback (MEDIUM)

- `a11y-visual-equivalent` - Every sound must have a visual equivalent
- `a11y-toggle-setting` - Provide toggle to disable sounds
- `a11y-reduced-motion-check` - Respect prefers-reduced-motion for sound
- `a11y-volume-control` - Allow independent volume adjustment
- `appropriate-no-high-frequency` - No sound on typing or keyboard nav
- `appropriate-confirmations-only` - Sound for payments, uploads, submissions
- `appropriate-errors-warnings` - Sound for errors that can't be overlooked
- `appropriate-no-decorative` - No sound on hover or decorative moments
- `appropriate-no-punishing` - Inform, don't punish with harsh sounds
- `impl-preload-audio` - Preload audio files to avoid delay
- `impl-default-subtle` - Default volume subtle (0.3), not loud
- `impl-reset-current-time` - Reset currentTime before replay
- `weight-match-action` - Sound weight matches action importance
- `weight-duration-matches-action` - Sound duration matches action duration

### 6. Sound Synthesis (MEDIUM)

- `context-reuse-single` - Reuse single AudioContext, don't create per sound
- `context-resume-suspended` - Resume suspended AudioContext before playing
- `context-cleanup-nodes` - Disconnect audio nodes after playback
- `envelope-exponential-decay` - Exponential ramps for natural decay
- `envelope-no-zero-target` - Exponential ramps target 0.001, not 0
- `envelope-set-initial-value` - Set initial value before ramping
- `design-noise-for-percussion` - Filtered noise for clicks/taps
- `design-oscillator-for-tonal` - Oscillators with pitch sweep for tonal sounds
- `design-filter-for-character` - Bandpass filter to shape percussive sounds
- `param-click-duration` - Click sounds: 5-15ms duration
- `param-filter-frequency-range` - Click filter: 3000-6000Hz
- `param-reasonable-gain` - Gain under 1.0 to prevent clipping
- `param-q-value-range` - Filter Q: 2-5 for focused but natural

### 7. Morphing Icons (LOW)

- `morphing-three-lines` - Every icon uses exactly 3 SVG lines
- `morphing-use-collapsed` - Unused lines use collapsed constant
- `morphing-consistent-viewbox` - All icons share same viewBox (14x14)
- `morphing-group-variants` - Rotational variants share group and base lines
- `morphing-spring-rotation` - Spring physics for grouped icon rotation
- `morphing-reduced-motion` - Respect prefers-reduced-motion
- `morphing-jump-non-grouped` - Instant rotation jump between non-grouped icons
- `morphing-strokelinecap-round` - Round stroke line caps
- `morphing-aria-hidden` - Icon SVGs are aria-hidden

### 8. Container Animation (MEDIUM)

- `container-two-div-pattern` - Outer animated div, inner measured div; never same element
- `container-guard-initial-zero` - Guard bounds === 0 on initial render, fall back to "auto"
- `container-use-resize-observer` - Use ResizeObserver for measurement, not getBoundingClientRect
- `container-overflow-hidden` - Set overflow: hidden on animated container during transitions
- `container-no-excessive-use` - Use sparingly: buttons, accordions, interactive elements
- `container-callback-ref` - Use callback ref (not useRef) for measurement hooks
- `container-transition-delay` - Add small delay for natural catching-up feel

### 9. Laws of UX (HIGH)

- `ux-fitts-target-size` - Size interactive targets for easy clicking (min 32px)
- `ux-fitts-hit-area` - Expand hit areas with invisible padding or pseudo-elements
- `ux-hicks-minimize-choices` - Minimize choices to reduce decision time
- `ux-millers-chunking` - Chunk data into groups of 5-9 for scannability
- `ux-doherty-under-400ms` - Respond within 400ms to feel instant
- `ux-doherty-perceived-speed` - Fake speed with skeletons, optimistic UI, progress indicators
- `ux-postels-accept-messy-input` - Accept messy input, output clean data
- `ux-progressive-disclosure` - Show what matters now, reveal complexity later
- `ux-jakobs-familiar-patterns` - Use familiar UI patterns users know from other sites
- `ux-aesthetic-usability` - Visual polish increases perceived usability
- `ux-proximity-grouping` - Group related elements spatially with tighter spacing
- `ux-similarity-consistency` - Similar elements should look alike
- `ux-common-region-boundaries` - Use boundaries to group related content
- `ux-von-restorff-emphasis` - Make important elements visually distinct
- `ux-serial-position` - Place key items first or last in sequences
- `ux-peak-end-finish-strong` - End experiences with clear success states
- `ux-teslers-complexity` - Move complexity to the system, not the user
- `ux-goal-gradient-progress` - Show progress toward completion
- `ux-zeigarnik-show-incomplete` - Show incomplete state to drive completion
- `ux-pragnanz-simplify` - Simplify complex visuals into clear forms
- `ux-pareto-prioritize-features` - Prioritize the critical 20% of features
- `ux-cognitive-load-reduce` - Minimize extraneous cognitive load
- `ux-uniform-connectedness` - Visually connect related elements with lines or frames

### 10. Predictive Prefetching (MEDIUM)

- `prefetch-trajectory-over-hover` - Trajectory prediction over hover; reclaims 100-200ms
- `prefetch-not-everything` - Prefetch by intent, not viewport; avoid wasted bandwidth
- `prefetch-hit-slop` - Use hitSlop to trigger predictions earlier
- `prefetch-touch-fallback` - Fall back gracefully on touch devices (no cursor)
- `prefetch-keyboard-tab` - Prefetch on keyboard navigation when focus approaches
- `prefetch-use-selectively` - Use predictive prefetching where latency is noticeable

### 11. Typography (MEDIUM)

- `type-tabular-nums-for-data` - Tabular numbers for columns, dashboards, pricing
- `type-oldstyle-nums-for-prose` - Oldstyle numbers blend into body text
- `type-slashed-zero` - Slashed zero in code-adjacent UIs
- `type-opentype-contextual-alternates` - Keep calt enabled for contextual glyph adjustment
- `type-disambiguation-stylistic-set` - Enable ss02 to distinguish I/l/1 and 0/O
- `type-optical-sizing-auto` - Leave font-optical-sizing auto for size-adaptive glyphs
- `type-antialiased-on-retina` - Antialiased font smoothing on retina displays
- `type-text-wrap-balance-headings` - text-wrap: balance on headings for even lines
- `type-underline-offset` - Offset underlines below descenders
- `type-no-font-synthesis` - Disable font-synthesis to prevent faux bold/italic
- `type-font-display-swap` - Use font-display: swap to avoid invisible text during load
- `type-variable-weight-continuous` - Use continuous weight values (100-900) with variable fonts
- `type-text-wrap-pretty` - text-wrap: pretty for body text to reduce orphans
- `type-justify-with-hyphens` - Pair text-align: justify with hyphens: auto
- `type-letter-spacing-uppercase` - Add letter-spacing to uppercase and small-caps text
- `type-proper-fractions` - Use diagonal-fractions for proper typographic fractions

### 12. Visual Design (HIGH)

- `visual-concentric-radius` - Inner radius = outer radius minus padding for nested elements
- `visual-layered-shadows` - Layer multiple shadows for realistic depth
- `visual-shadow-direction` - All shadows share same offset direction (single light source)
- `visual-no-pure-black-shadow` - Use neutral colors, not pure black, for shadows
- `visual-shadow-matches-elevation` - Shadow size indicates elevation in consistent scale
- `visual-animate-shadow-pseudo` - Animate shadow via pseudo-element opacity for performance
- `visual-consistent-spacing-scale` - Use a consistent spacing scale, not arbitrary values
- `visual-border-alpha-colors` - Semi-transparent borders adapt to any background
- `visual-button-shadow-anatomy` - Six-layer shadow anatomy for polished buttons

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/timing-under-300ms.md
rules/spring-for-gestures.md
rules/ux-doherty-under-400ms.md
rules/type-tabular-nums-for-data.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`
