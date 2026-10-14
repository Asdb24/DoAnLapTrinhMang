"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { spring } from "@/lib/springs";
import { FluidHoverReturn } from "@/hooks/use-fluid-hover";
import { cn } from "@/lib/utils";

export interface FluidHoverHighlightProps {
  hover: FluidHoverReturn;
  className?: string;
  hidden?: boolean;
}

/**
 * FluidHoverHighlight: A single overlay that springs to the bounding rect of the
 * nearest registered item in the container, eliminating row-hover flicker.
 */
export function FluidHoverHighlight({
  hover,
  className,
  hidden = false,
}: FluidHoverHighlightProps) {
  const { activeRect, activeIndex } = hover;

  if (hidden || activeIndex === null || !activeRect) {
    return null;
  }

  return (
    <motion.div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-0 rounded-md bg-accent/60 dark:bg-accent/40",
        className
      )}
      initial={false}
      animate={{
        x: activeRect.x,
        y: activeRect.y,
        width: activeRect.width,
        height: activeRect.height,
        opacity: 1,
      }}
      exit={{
        opacity: 0,
        transition: spring.fast.exit,
      }}
      transition={spring.fast}
    />
  );
}
