import React from "react";
import { cn } from "@/lib/utils";

/**
 * Fluid Functionalism — Font Weight Tokens
 * Uses variable font weight settings with optical size tuning to eliminate reflow.
 */
export const fontWeights = {
  normal: "'wght' 400, 'opsz' 14",
  medium: "'wght' 500, 'opsz' 14",
  semibold: "'wght' 600, 'opsz' 14",
  bold: "'wght' 700, 'opsz' 14",
} as const;

export interface GhostSpanProps extends React.HTMLAttributes<HTMLSpanElement> {
  active?: boolean;
  children: React.ReactNode;
  restingWeight?: keyof typeof fontWeights;
  activeWeight?: keyof typeof fontWeights;
}

const weightClassMap: Record<keyof typeof fontWeights, string> = {
  normal: "after:font-normal",
  medium: "after:font-medium",
  semibold: "after:font-semibold",
  bold: "after:font-bold",
};

/**
 * GhostSpan: Renders an active label with an invisible clone at the heavier weight,
 * reserving layout width so that weight changes cause ZERO neighbor reflow.
 * Uses a CSS pseudo-element to eliminate DOM text node duplication for clean accessibility and testing.
 */
export function GhostSpan({
  active = false,
  children,
  restingWeight = "normal",
  activeWeight = "semibold",
  className,
  style,
  ...props
}: GhostSpanProps) {
  const text = typeof children === "string" ? children : undefined;

  return React.createElement(
    "span",
    {
      "data-text": text,
      className: cn(
        "inline-grid select-none",
        text && [
          "after:content-[attr(data-text)]",
          "after:col-start-1 after:row-start-1",
          "after:invisible after:select-none after:pointer-events-none",
          "after:[font-variation-settings:var(--ghost-weight)]",
          weightClassMap[activeWeight],
        ],
        className
      ),
      style: {
        ...(style || {}),
        ["--ghost-weight" as string]: fontWeights[activeWeight],
      },
      ...props,
    },
    React.createElement(
      "span",
      {
        className:
          "col-start-1 row-start-1 transition-[color,font-variation-settings] duration-80",
        style: {
          fontVariationSettings: active
            ? fontWeights[activeWeight]
            : fontWeights[restingWeight],
        },
      },
      children
    ),
    !text &&
      typeof window !== "undefined" &&
      React.createElement(
        "span",
        {
          "aria-hidden": "true",
          className:
            "col-start-1 row-start-1 invisible select-none pointer-events-none",
          style: { fontVariationSettings: fontWeights[activeWeight] },
        },
        children
      )
  );
}

