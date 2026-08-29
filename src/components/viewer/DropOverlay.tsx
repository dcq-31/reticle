"use client";

import { useEffect } from "react";

import { useFileOpen } from "@/hooks/useFileOpen";
import { useViewerStore } from "@/store";

/**
 * Window-level drag-and-drop receiver. Renders an overlay while a drag is
 * over the document; on drop, hands the first file to `useFileOpen`.
 */
export function DropOverlay(): React.ReactElement | null {
  const dragActive = useViewerStore((s) => s.dragActive);
  const { openBase, openOverlay } = useFileOpen();

  useEffect(() => {
    let depth = 0;
    const setActive = (active: boolean) => useViewerStore.getState().setDragActive(active);

    const onDragEnter = (e: DragEvent): void => {
      e.preventDefault();
      depth++;
      setActive(true);
    };
    const onDragOver = (e: DragEvent): void => {
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent): void => {
      e.preventDefault();
      depth--;
      if (depth <= 0) {
        depth = 0;
        setActive(false);
      }
    };
    const onDrop = (e: DragEvent): void => {
      e.preventDefault();
      depth = 0;
      setActive(false);
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      // Shift held → add as overlay; otherwise replace the base.
      if (e.shiftKey && useViewerStore.getState().base) {
        void openOverlay(file);
      } else {
        void openBase(file);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [openBase, openOverlay]);

  if (!dragActive) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-0"
      style={{ background: "rgba(5,9,12,0.86)", backdropFilter: "blur(3px)" }}
    >
      <div
        role="status"
        aria-live="assertive"
        className="border-accent max-w-[min(92vw,28rem)] rounded-2xl border-2 border-dashed bg-[rgba(12,18,24,0.7)] px-8 py-8 text-center md:px-16 md:py-12"
      >
        <h2 className="m-0 mb-1.5 text-sm font-semibold tracking-wide md:text-base">
          Drop a NIfTI volume
        </h2>
        <p className="text-dim m-0 text-[11px] md:text-xs">
          .nii or .nii.gz · hold <kbd className="text-accent">shift</kbd> to add as overlay
        </p>
      </div>
    </div>
  );
}
