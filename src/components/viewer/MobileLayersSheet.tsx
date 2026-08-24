"use client";

import { useEffect } from "react";

import { LayerList } from "@/components/controls/LayerList";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useViewerStore } from "@/store";

export function MobileLayersSheet(): React.ReactElement | null {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const open = useViewerStore((s) => s.mobileLayersOpen);
  const setOpen = useViewerStore((s) => s.setMobileLayersOpen);
  const overlayCount = useViewerStore((s) => s.overlays.length);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (isDesktop && open) setOpen(false);
  }, [isDesktop, open, setOpen]);

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
            aria-label="Close overlays"
            onClick={() => setOpen(false)}
            className="border-line-bright text-dim hover:text-fg hover:bg-surface-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border text-[12px]"
          >
            ✕
          </button>
        </header>
        <div className="max-h-[calc(82svh-4rem)] overflow-y-auto px-3.5 py-3">
          <LayerList title="Layers" variant="mobile" onOverlayRemoved={() => setOpen(false)} />
        </div>
      </section>
    </div>
  );
}
