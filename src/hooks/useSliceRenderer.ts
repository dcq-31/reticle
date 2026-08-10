"use client";

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";

import type { SliceRenderStoreAdapter } from "@/hooks/renderStoreAdapters";
import { planeSizes, sliceCoord, type Plane } from "@/lib/geometry/planes";
import { renderSliceToImageData } from "@/lib/render/slice";
import { viewLayout, type ViewportState } from "@/lib/render/viewLayout";
import { FrameScheduler } from "@/lib/utils/raf";

export interface SliceRendererHandle {
  /**
   * Ask the renderer for a frame. If `offscreenDirty` is true (the default),
   * the per-plane ImageData is rebuilt before compositing.
   */
  requestRender: (offscreenDirty?: boolean) => void;
  /** Notify the renderer that the canvas CSS size changed. */
  setCanvasSize: (width: number, height: number) => void;
}

const MAX_DPR = 2;

/**
 * Drives one 2D plane's offscreen-build + compositor pipeline.
 *
 * Owned imperative refs (no React state, no re-renders):
 *  - offscreen HTMLCanvasElement + 2D context
 *  - ImageData buffer sized to the plane's voxel dims
 *  - canvas DPR + CSS size
 *  - dirty flag for the offscreen pass
 *
 * The hook subscribes to store slices that matter for this plane and asks
 * for a frame whenever they change. Pointer-driven interactions (pan/zoom
 * via `viewportRef`) call `requestRender(false)` directly, skipping the
 * offscreen rebuild.
 */
export function useSliceRenderer(
  plane: Plane,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  viewportRef: RefObject<ViewportState>,
  storeAdapter: SliceRenderStoreAdapter,
): SliceRendererHandle {
  const offCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const imgDataRef = useRef<ImageData | null>(null);
  const sizeRef = useRef({ width: 1, height: 1, dpr: 1 });
  const dirtyOffRef = useRef(true);
  const schedRef = useRef<FrameScheduler | null>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { base, overlays, cross, crosshairVisible, convention, interp } = storeAdapter.getSnapshot();
    const size = sizeRef.current;

    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size.width, size.height);

    if (!base) return;

    const volume = base.volume;
    const { sizeH, sizeV } = planeSizes(volume, plane, convention);

    let off = offCanvasRef.current;
    let offCtx = offCtxRef.current;
    if (!off || !offCtx) {
      off = document.createElement("canvas");
      offCtx = off.getContext("2d", { willReadFrequently: false });
      if (!offCtx) return;
      offCanvasRef.current = off;
      offCtxRef.current = offCtx;
    }
    if (off.width !== sizeH || off.height !== sizeV) {
      off.width = sizeH;
      off.height = sizeV;
      imgDataRef.current = offCtx.createImageData(sizeH, sizeV);
      dirtyOffRef.current = true;
    }

    if (dirtyOffRef.current) {
      const imgData = imgDataRef.current;
      if (imgData) {
        const display = base.display;
        const winLow = display.win.level - display.win.width / 2;
        const overlayInputs = overlays
          .filter((l) => l.display.visible && l.display.opacity > 0)
          .map((l) => ({
            volume: l.volume,
            winLow: l.display.win.level - l.display.win.width / 2,
            winWidth: l.display.win.width,
            lut: l.display.lut,
            opacity: l.display.opacity,
          }));
        renderSliceToImageData(
          {
            volume,
            plane,
            convention,
            winLow,
            winWidth: display.win.width,
            lut: display.lut,
            slice: sliceCoord(cross, plane),
            timeIndex: cross.t,
            ...(overlayInputs.length > 0 ? { overlays: overlayInputs } : {}),
          },
          imgData,
        );
        offCtx.putImageData(imgData, 0, 0);
      }
      dirtyOffRef.current = false;
    }

    const layout = viewLayout(
      volume,
      plane,
      convention,
      { width: size.width, height: size.height },
      viewportRef.current,
    );

    ctx.imageSmoothingEnabled = interp === "smooth";
    ctx.drawImage(off, layout.originX, layout.originY, layout.displayWidth, layout.displayHeight);

    if (crosshairVisible) {
      const g = layout.geom;
      const worldCoord: readonly [number, number, number] = [cross.r, cross.a, cross.s];
      const hWorld = worldCoord[g.hAxis]!;
      const vWorld = worldCoord[g.vAxis]!;
      const hPx = g.flipH ? layout.sizeH - 1 - hWorld : hWorld;
      const vPx = g.flipV ? layout.sizeV - 1 - vWorld : vWorld;
      const cx = layout.originX + ((hPx + 0.5) / layout.sizeH) * layout.displayWidth;
      const cy = layout.originY + ((vPx + 0.5) / layout.sizeV) * layout.displayHeight;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(246,166,35,0.85)";
      ctx.beginPath();
      ctx.moveTo(cx, layout.originY);
      ctx.lineTo(cx, layout.originY + layout.displayHeight);
      ctx.moveTo(layout.originX, cy);
      ctx.lineTo(layout.originX + layout.displayWidth, cy);
      ctx.stroke();
      ctx.fillStyle = "rgba(246,166,35,0.95)";
      ctx.beginPath();
      ctx.arc(cx, cy, 2.2, 0, 7);
      ctx.fill();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(cx, cy, 1.0, 0, 7);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
  }, [plane, canvasRef, viewportRef, storeAdapter]);

  useEffect(() => {
    schedRef.current = new FrameScheduler(render);
    return () => {
      schedRef.current?.cancel();
      schedRef.current = null;
    };
  }, [render]);

  const requestRender = useCallback<SliceRendererHandle["requestRender"]>(
    (offscreenDirty = true) => {
      if (offscreenDirty) dirtyOffRef.current = true;
      schedRef.current?.request();
    },
    [],
  );

  const setCanvasSize = useCallback<SliceRendererHandle["setCanvasSize"]>(
    (width, height) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      sizeRef.current = { width, height, dpr };
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      requestRender(false);
    },
    [canvasRef, requestRender],
  );

  // Subscribe to store changes that affect this plane's offscreen output.
  useEffect(() => {
    const unsubOff = storeAdapter.subscribeOffscreen(() => requestRender(true));
    const unsubCompositor = storeAdapter.subscribeCompositor(() => requestRender(false));

    return () => {
      unsubOff();
      unsubCompositor();
    };
  }, [requestRender, storeAdapter]);

  return useMemo(() => ({ requestRender, setCanvasSize }), [requestRender, setCanvasSize]);
}
