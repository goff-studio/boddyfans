/**
 * Motion tokens. Every curve and duration in the app comes from here, and the
 * CSS custom properties in index.css mirror these values for the transitions
 * that are cheaper to run from a stylesheet.
 */

/** Strong ease-out for UI entrances and exits. Built-in `ease-out` is weaker. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const

/** iOS-like push curve (Ionic). Used for full-screen travel between routes. */
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const

export const DURATION = {
  /** Button press feedback. */
  press: 0.14,
  /** Small reveals: dropdowns, inline state changes. */
  micro: 0.18,
  /** In-screen content: kicker, headline lines, body, CTA. */
  short: 0.22,
  /** Full-screen push between the hub and a track. */
  screen: 0.32,
} as const

/** Delay between staggered children. Below ~30ms reads as simultaneous. */
export const STAGGER = 0.05
