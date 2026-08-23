"use client";

import { useEffect } from "react";

import { useViewerStore } from "@/store";

const AUTO_DISMISS_MS = 2600;

export function Toast(): React.ReactElement | null {
  const toast = useViewerStore((s) => s.toast);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => {
      useViewerStore.getState().dismissToast();
    }, AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!toast) return null;

  const isError = toast.kind === "error";
  return (
    <div
      role="status"
      aria-live={isError ? "assertive" : "polite"}
      className={
        "bg-surface-2 fixed bottom-4 left-1/2 z-50 max-w-[min(90vw,24rem)] -translate-x-1/2 rounded-lg border px-3 py-2 text-[11px] shadow-[0_8px_30px_rgba(0,0,0,0.5)] md:bottom-10 md:px-4 md:py-2.5 md:text-xs " +
        (isError ? "border-danger text-[#ffd7d6]" : "border-line-bright text-fg")
      }
    >
      {toast.text}
    </div>
  );
}
