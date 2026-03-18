# Sections

This file defines all sections, their ordering, impact levels, and descriptions.
The section ID (in parentheses) is the filename prefix used to group rules.

---

## 1. Animation Principles (timing, physics, staging)

**Impact:** CRITICAL
**Description:** Disney's 12 principles adapted for web. Timing, physics, and staging rules ensure animations feel natural and purposeful. Violations here produce the most noticeable quality issues.

## 2. Timing Functions (spring, easing, duration, none)

**Impact:** HIGH
**Description:** Choosing the right timing function—spring, easing curve, or no animation—based on whether motion is user-driven, system-driven, or high-frequency.

## 3. Exit Animations (exit, presence, mode, nested)

**Impact:** HIGH
**Description:** AnimatePresence and exit animation patterns in Motion/Framer Motion. Correct usage prevents layout shifts, stale interactions, and orphaned elements.

## 4. CSS Pseudo Elements (pseudo, transition, native)

**Impact:** MEDIUM
**Description:** Leveraging ::before, ::after, View Transitions API, and native pseudo-elements (::backdrop, ::placeholder, ::selection) to reduce DOM nodes and improve transitions.

## 5. Audio Feedback (a11y, appropriate, impl, weight)

**Impact:** MEDIUM
**Description:** When and how to use sound in UI. Covers accessibility, appropriateness heuristics, implementation patterns, and matching sound weight to action importance.

## 6. Sound Synthesis (context, envelope, design, param)

**Impact:** MEDIUM
**Description:** Web Audio API best practices for procedural sound generation. Covers AudioContext management, envelope shaping, sound design patterns, and parameter ranges.

## 7. Morphing Icons (morphing)

**Impact:** LOW
**Description:** Building icon components that morph between any two icons through SVG line transformation. All icons share a 3-line structure enabling seamless transitions.

## 8. Container Animation (container)

**Impact:** MEDIUM
**Description:** Animating container width and height using a measure-and-animate pattern with ResizeObserver and Motion. The two-div pattern separates measurement from animation to avoid feedback loops.

## 9. Laws of UX (ux)

**Impact:** HIGH
**Description:** Psychological principles behind interfaces that feel right. Covers Fitts's Law (target sizing), Hick's Law (choice reduction), Miller's Law (chunking), Doherty Threshold (response time), and Postel's Law (input tolerance).

## 10. Predictive Prefetching (prefetch)

**Impact:** MEDIUM
**Description:** Loading content before the user clicks by analyzing cursor trajectory, reducing perceived latency by 100-200ms. Covers trajectory vs hover vs click strategies and device-aware fallbacks.

## 11. Typography (type)

**Impact:** MEDIUM
**Description:** CSS font and text properties most developers overlook. OpenType features, numeric variants, variable font axes, text rendering, wrapping, and decoration controls that make typography feel considered.

## 12. Visual Design (visual)

**Impact:** HIGH
**Description:** CSS design fundamentals that compound into visual polish. Concentric border radius, layered shadows, consistent spacing scales, and alpha borders. Small details that separate considered interfaces from default ones.
