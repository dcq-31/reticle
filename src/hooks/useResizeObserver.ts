"use client";

import { useEffect, type RefObject } from "react";

export interface ObservedSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Observe the bounding rect of `ref.current` and fire `onResize` on every
 * change (including the initial mount). Returns nothing — pass a stable
 * callback (or wrap with `useCallback`) to avoid re-subscribing.
 */
export function useResizeObserver(
  ref: RefObject<Element | null>,
  onResize: (size: ObservedSize) => void,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      onResize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, onResize]);
}
