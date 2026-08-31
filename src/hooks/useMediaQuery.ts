"use client";

import { useCallback, useSyncExternalStore } from "react";

function subscribe(query: string, onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(query);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function snapshot(query: string): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(query).matches;
}

/**
 * Client-safe media query hook.
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const subscribeToQuery = useCallback((onChange: () => void) => subscribe(query, onChange), [query]);
  const getSnapshot = useCallback(() => snapshot(query), [query]);
  return useSyncExternalStore(
    subscribeToQuery,
    getSnapshot,
    () => defaultValue,
  );
}
