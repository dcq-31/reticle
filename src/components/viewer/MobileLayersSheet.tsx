"use client";

import { useEffect, useRef } from "react";

import { LayerList } from "@/components/controls/LayerList";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { DESKTOP_BP } from "@/lib/utils/constants";
import { useViewerStore } from "@/store";

export function MobileLayersSheet(): React.ReactElement | null {
  const isDesktop = useMediaQuery(DESKTOP_BP);
  const open = useViewerStore((s) => s.mobileLayersOpen);
  const setOpen = useViewerStore((s) => s.setMobileLayersOpen);
  const overlayCount = useViewerStore((s) => s.overlays.length);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  // Close on desktop breakpoint
  useEffect(() => {
    if (isDesktop && open) setOpen(false);
  }, [isDesktop, open, setOpen]);

  // Focus trap: save previous focus, focus close button on open, restore on close
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, [open]);

  // Trap Tab/Shift+Tab within the dialog
  useEffect(() => {
    if (!open) return;
    const dialog = closeRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => dialog.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const handleOverlayRemoved = (): void => {
    const remaining = useViewerStore.getState().overlays.length;
    if (remaining === 0) setOpen(false);
  };

  if (isDesktop || !open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/55 p-2 sm:items-center sm:p-4"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Overlays"
        className="bg-panel border-line max-h-[82svh] w-full max-w-[42rem] overflow-hidden rounded-t-2xl border shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-line flex items-center gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-faint font-mono text-[10px] tracking-[0.14em] uppercase">
              Overlays
            </div>
            <div className="text-fg truncate text-sm">
              {overlayCount > 0
                ? `${overlayCount} overlay${overlayCount === 1 ? "" : "s"}`
                : "Base layer"}
            </div>
          </div>
          <button
            type="button"
            ref={closeRef}
            aria-label="Close overlays"
            onClick={() => setOpen(false)}
            className="border-line-bright text-dim hover:text-fg hover:bg-surface-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border text-[12px]"
          >
            ✕
          </button>
        </header>
        <div className="max-h-[calc(82svh-4rem)] overflow-y-auto px-3.5 py-3">
          <LayerList title="Layers" variant="mobile" onOverlayRemoved={handleOverlayRemoved} />
        </div>
      </section>
    </div>
  );
}
