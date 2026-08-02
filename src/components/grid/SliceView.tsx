"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { useResizeObserver } from "@/hooks/useResizeObserver";
import { useSliceRenderer } from "@/hooks/useSliceRenderer";
import { useViewportPointer } from "@/hooks/useViewportPointer";
import { planeSizes, sliceCoord, type Plane } from "@/lib/geometry/planes";
import type { ViewportState } from "@/lib/render/viewLayout";
import { clamp } from "@/lib/utils/clamp";
import { useViewerStore } from "@/store";

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 12;

interface SliceViewProps {
  readonly plane: Plane;
}

const PLANE_LABEL: Record<Plane, string> = {
  axial: "Axial",
  coronal: "Coronal",
  sagittal: "Sagittal",
};

export function SliceView({ plane }: SliceViewProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<ViewportState>({ zoom: 1, panX: 0, panY: 0 });

  const { requestRender, setCanvasSize } = useSliceRenderer(plane, canvasRef, viewportRef);
  useViewportPointer(plane, canvasRef, viewportRef, requestRender);

  const onResize = useCallback(
    ({ width, height }: { width: number; height: number }) => {
      setCanvasSize(width, height);
    },
    [setCanvasSize],
  );
  useResizeObserver(containerRef, onResize);

  const sliceLabel = useViewerStore((s) => {
    if (!s.base) return "";
    const { nSlices } = planeSizes(s.base.volume, plane, s.convention);
    return `${sliceCoord(s.cross, plane) + 1}/${nSlices}`;
  });
  const convention = useViewerStore((s) => s.convention);
  const orientLabels = useMemo(() => orientLabelsFor(plane, convention), [plane, convention]);

  // resetSeq broadcast: clear local pan/zoom and ask for a fresh frame.
  const resetSeq = useViewerStore((s) => s.resetSeq);
  useEffect(() => {
    viewportRef.current.zoom = 1;
    viewportRef.current.panX = 0;
    viewportRef.current.panY = 0;
    requestRender(false);
  }, [resetSeq, requestRender]);

  const setZoom = useCallback(
    (factor: number) => {
      viewportRef.current.zoom = clamp(viewportRef.current.zoom * factor, ZOOM_MIN, ZOOM_MAX);
      requestRender(false);
    },
    [requestRender],
  );
  const fit = useCallback(() => {
    viewportRef.current.zoom = 1;
    viewportRef.current.panX = 0;
    viewportRef.current.panY = 0;
    requestRender(false);
  }, [requestRender]);
  const toggleMaximize = useCallback(() => {
    const store = useViewerStore.getState();
    store.setMaxView(store.maxView === plane ? null : plane);
  }, [plane]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={`${PLANE_LABEL[plane]} view`}
      onDoubleClick={toggleMaximize}
      className="bg-bg group relative h-full min-h-0 w-full min-w-0 overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full cursor-crosshair touch-none"
      />
      <div className="text-accent border-line pointer-events-none absolute top-2 left-2 rounded border bg-black/55 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase select-none">
        {PLANE_LABEL[plane]}
        <span className="text-dim ml-1.5">{sliceLabel}</span>
      </div>
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <ViewTool title="Zoom in" onClick={() => setZoom(1.25)}>
          +
        </ViewTool>
        <ViewTool title="Zoom out" onClick={() => setZoom(1 / 1.25)}>
          −
        </ViewTool>
        <ViewTool title="Fit" onClick={fit}>
          ⤢
        </ViewTool>
        <ViewTool title="Maximize" onClick={toggleMaximize}>
          ▣
        </ViewTool>
      </div>
      <OrientCorner pos="t">{orientLabels.t}</OrientCorner>
      <OrientCorner pos="b">{orientLabels.b}</OrientCorner>
      <OrientCorner pos="l">{orientLabels.l}</OrientCorner>
      <OrientCorner pos="r">{orientLabels.r}</OrientCorner>
    </div>
  );
}

interface ViewToolProps {
  readonly title: string;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}

function ViewTool({ title, onClick, children }: ViewToolProps): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="border-line text-dim hover:text-fg hover:border-line-bright flex h-6 w-6 cursor-pointer items-center justify-center rounded border bg-[rgba(8,14,18,0.7)] text-xs"
    >
      {children}
    </button>
  );
}

function OrientCorner({
  pos,
  children,
}: {
  pos: "t" | "b" | "l" | "r";
  children: React.ReactNode;
}): React.ReactElement {
  const cls =
    pos === "t"
      ? "top-1.5 left-1/2 -translate-x-1/2"
      : pos === "b"
        ? "bottom-1.5 left-1/2 -translate-x-1/2"
        : pos === "l"
          ? "left-1.5 top-1/2 -translate-y-1/2"
          : "right-1.5 top-1/2 -translate-y-1/2";
  return (
    <div
      className={`pointer-events-none absolute ${cls} font-mono text-[10px] text-[#9fb0bd] select-none`}
      style={{ textShadow: "0 0 4px #000" }}
    >
      {children}
    </div>
  );
}

interface OrientLabels {
  readonly t: string;
  readonly b: string;
  readonly l: string;
  readonly r: string;
}

function orientLabelsFor(plane: Plane, convention: "neuro" | "radio"): OrientLabels {
  const radio = convention === "radio";
  if (plane === "axial") {
    return { t: "A", b: "P", l: radio ? "R" : "L", r: radio ? "L" : "R" };
  }
  if (plane === "coronal") {
    return { t: "S", b: "I", l: radio ? "R" : "L", r: radio ? "L" : "R" };
  }
  return { t: "S", b: "I", l: "A", r: "P" };
}
