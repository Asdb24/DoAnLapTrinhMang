"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

export type HoverAxis = "x" | "y" | "xy";

export interface FluidHoverOptions {
  axis?: HoverAxis;
  disabled?: boolean;
}

export interface ItemRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FluidHoverReturn {
  activeIndex: number | null;
  activeRect: ItemRect | null;
  registerItem: (index: number, el: HTMLElement | null) => void;
  handlers: {
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerLeave: () => void;
    onClick: (e: React.MouseEvent) => void;
  };
  remeasure: () => void;
}

export function useFluidHover(
  containerRef: React.RefObject<HTMLElement | null>,
  options: FluidHoverOptions = {}
): FluidHoverReturn {
  const { axis = "y", disabled = false } = options;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeRect, setActiveRect] = useState<ItemRect | null>(null);
  const itemsRef = useRef<Map<number, HTMLElement>>(new Map());

  const registerItem = useCallback((index: number, el: HTMLElement | null) => {
    if (el) {
      itemsRef.current.set(index, el);
    } else {
      itemsRef.current.delete(index);
    }
  }, []);

  const remeasure = useCallback(() => {
    if (activeIndex === null || !containerRef.current) return;
    const target = itemsRef.current.get(activeIndex);
    if (!target) {
      setActiveRect(null);
      return;
    }
    const cRect = containerRef.current.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    setActiveRect({
      x: tRect.left - cRect.left,
      y: tRect.top - cRect.top,
      width: tRect.width,
      height: tRect.height,
    });
  }, [activeIndex, containerRef]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !containerRef.current || itemsRef.current.size === 0) return;

      const px = e.clientX;
      const py = e.clientY;

      let nearestIndex: number | null = null;
      let minDistance = Infinity;

      for (const [index, el] of itemsRef.current.entries()) {
        if (!el || el.offsetParent === null) continue;
        const rect = el.getBoundingClientRect();

        let dist = 0;
        if (axis === "y") {
          const centerY = rect.top + rect.height / 2;
          dist = Math.abs(py - centerY);
        } else if (axis === "x") {
          const centerX = rect.left + rect.width / 2;
          dist = Math.abs(px - centerX);
        } else {
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          dist = Math.hypot(px - centerX, py - centerY);
        }

        if (dist < minDistance) {
          minDistance = dist;
          nearestIndex = index;
        }
      }

      if (nearestIndex !== null && nearestIndex !== activeIndex) {
        setActiveIndex(nearestIndex);
        const target = itemsRef.current.get(nearestIndex);
        if (target && containerRef.current) {
          const cRect = containerRef.current.getBoundingClientRect();
          const tRect = target.getBoundingClientRect();
          setActiveRect({
            x: tRect.left - cRect.left,
            y: tRect.top - cRect.top,
            width: tRect.width,
            height: tRect.height,
          });
        }
      }
    },
    [disabled, axis, activeIndex, containerRef]
  );

  const onPointerLeave = useCallback(() => {
    setActiveIndex(null);
    setActiveRect(null);
  }, []);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (activeIndex === null) return;
      // If clicking inside the container but not on a target directly, route to the nearest active item
      const activeEl = itemsRef.current.get(activeIndex);
      if (activeEl && e.target === containerRef.current) {
        activeEl.click();
      }
    },
    [activeIndex, containerRef]
  );

  useEffect(() => {
    if (containerRef.current) {
      if (activeIndex !== null) {
        containerRef.current.setAttribute("data-fluid-hover-active-index", String(activeIndex));
      } else {
        containerRef.current.removeAttribute("data-fluid-hover-active-index");
      }
    }
  }, [activeIndex, containerRef]);

  return {
    activeIndex,
    activeRect,
    registerItem,
    handlers: {
      onPointerMove,
      onPointerLeave,
      onClick,
    },
    remeasure,
  };
}

export function useRegisterFluidHoverItem(
  register: (index: number, el: HTMLElement | null) => void,
  index: number,
  ref: React.RefObject<HTMLElement | null>
) {
  useEffect(() => {
    register(index, ref.current);
    return () => register(index, null);
  }, [register, index, ref]);
}
