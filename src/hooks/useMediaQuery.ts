"use client";

import { useSyncExternalStore } from "react";

function subscribe(query: string, onChange: () => void): () => void {
  const mql = window.matchMedia(query);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function snapshot(query: string): boolean {
  return window.matchMedia(query).matches;
}

/**
 * Client-safe media query hook.
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => subscribe(query, onChange),
    () => snapshot(query),
    () => defaultValue,
  );
}
