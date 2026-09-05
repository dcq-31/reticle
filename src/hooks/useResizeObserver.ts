"use client";

import { useEffect, useRef, type RefObject } from "react";

export interface ObservedSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Observe the bounding rect of `ref.current` and fire `onResize` on every
 * change (including the initial mount). Safe to call with an unstable callback —
 * the latest version is always invoked without re-subscribing the observer.
 */
export function useResizeObserver(
  ref: RefObject<Element | null>,
  onResize: (size: ObservedSize) => void,
): void {
  const onResizeRef = useRef(onResize);
  useEffect(() => {
    onResizeRef.current = onResize;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      onResizeRef.current({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
}
