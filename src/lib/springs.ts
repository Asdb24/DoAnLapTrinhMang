/**
 * Fluid Functionalism — Motion System Tokens
 * Three spring tiers with paired faster exit tweens.
 * @see https://www.fluidfunctionalism.com/docs/motion
 */

export const spring = {
  /**
   * Fast spring (0.08s, bounce 0):
   * Use for hover, focus rings, fades, tooltips, selection indicators.
   */
  fast: {
    type: "spring" as const,
    duration: 0.08,
    bounce: 0,
    exit: {
      type: "tween" as const,
      duration: 0.06,
      ease: [0.32, 0, 0.67, 0] as [number, number, number, number],
    },
  },

  /**
   * Moderate spring (0.16s, bounce 0):
   * Use for short travel, small expansions (switch thumbs, badges, popover menus).
   */
  moderate: {
    type: "spring" as const,
    duration: 0.16,
    bounce: 0,
    exit: {
      type: "tween" as const,
      duration: 0.12,
      ease: [0.32, 0, 0.67, 0] as [number, number, number, number],
    },
  },

  /**
   * Slow spring (0.24s, bounce 0.12):
   * Use for large surfaces: dialogs, sidebars, drawer sheets, stepped wizards.
   */
  slow: {
    type: "spring" as const,
    duration: 0.24,
    bounce: 0.12,
    exit: {
      type: "tween" as const,
      duration: 0.16,
      ease: [0.32, 0, 0.67, 0] as [number, number, number, number],
    },
  },
} as const;

export type SpringTier = keyof typeof spring;
