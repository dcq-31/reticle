"use client";

import { useEffect, type RefObject } from "react";

import { type Plane } from "@/lib/geometry/planes";
import { canvasToWorldVoxel, viewLayout, type ViewportState } from "@/lib/render/viewLayout";
import { capturePointer } from "@/lib/utils/pointerCapture";
import { clamp } from "@/lib/utils/clamp";
import { ZOOM_MIN, ZOOM_MAX } from "@/lib/utils/constants";
import { keyState } from "@/lib/utils/keyState";
import { useViewerStore } from "@/store";
import { selectActiveLayer } from "@/store/volumeSlice";

type Mode = "crosshair" | "window" | "pan" | null;
type PointerKind = "mouse" | "pen" | "touch";

const ZOOM_STEP = 1.12;

/**
 * Attach pointer + wheel handlers to a plane's visible canvas.
 *
 * Behaviour mirrors the original viewer:
 *  - left button: set crosshair to pointer (and follow drag)
 *  - shift+left or right button: window/level drag
 *  - middle button: pan
 *  - wheel: step one slice; ctrl/meta + wheel: zoom toward cursor
 *
 * The pointer hook calls `requestRender(false)` on pan/zoom so the
 * renderer skips the expensive offscreen rebuild.
 */
export function useViewportPointer(
  plane: Plane,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  viewportRef: RefObject<ViewportState>,
  requestRender: (offscreenDirty?: boolean) => void,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mode: Mode = null;
    const pointers = new Map<number, { x: number; y: number; type: PointerKind }>();
    let startX = 0;
    let startY = 0;
    let startWinLevel = 0;
    let startWinWidth = 0;
    let startPanX = 0;
    let startPanY = 0;
    let touchStartZoom = 1;
    let touchStartPanX = 0;
    let touchStartPanY = 0;
    let touchStartDistance = 1;
    let touchStartCenterX = 0;
    let touchStartCenterY = 0;
    let touchStartLayout: ReturnType<typeof layoutNow> | null = null;
    const capturedPointers = new Set<number>();

    const canvasRect = (): DOMRect => canvas.getBoundingClientRect();

    const layoutNow = () => {
      const { base, convention } = useViewerStore.getState();
      if (!base) return null;
      const rect = canvasRect();
      return viewLayout(
        base.volume,
        plane,
        convention,
        { width: rect.width, height: rect.height },
        viewportRef.current,
      );
    };

    const updatePointer = (e: PointerEvent): void => {
      pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        type: e.pointerType as PointerKind,
      });
    };

    const removePointer = (e: PointerEvent): void => {
      pointers.delete(e.pointerId);
    };

    const releasePointer = (pointerId: number): void => {
      if (!capturedPointers.has(pointerId)) return;
      capturedPointers.delete(pointerId);
      try {
        canvas.releasePointerCapture(pointerId);
      } catch {
        // Capture is best-effort; cleanup should not fail if the browser already released it.
      }
    };

    const touchPointers = (): readonly { x: number; y: number }[] =>
      Array.from(pointers.values())
        .filter((p) => p.type === "touch")
        .slice(0, 2);

    const touchGesture = (): {
      readonly centerX: number;
      readonly centerY: number;
      readonly distance: number;
    } | null => {
      const [a, b] = touchPointers();
      if (!a || !b) return null;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      return {
        centerX: (a.x + b.x) / 2,
        centerY: (a.y + b.y) / 2,
        distance: Math.max(1, Math.hypot(dx, dy)),
      };
    };

    const updateCrosshairFrom = (e: PointerEvent): void => {
      const layout = layoutNow();
      if (!layout) return;
      const rect = canvasRect();
      const w = canvasToWorldVoxel({
        layout,
        canvasX: e.clientX - rect.left,
        canvasY: e.clientY - rect.top,
      });
      if (!w) return;
      const ax = layout.geom.hAxis;
      const ay = layout.geom.vAxis;
      useViewerStore.getState().setCross({
        ...crossPartial(ax, w.hWorld),
        ...crossPartial(ay, w.vWorld),
      });
    };

    const crossPartial = (
      axis: 0 | 1 | 2,
      value: number,
    ): { r?: number; a?: number; s?: number } => {
      if (axis === 0) return { r: value };
      if (axis === 1) return { a: value };
      return { s: value };
    };

    const onPointerDown = (e: PointerEvent): void => {
      const { base } = useViewerStore.getState();
      if (!base) return;
      if (capturePointer(canvas, e.pointerId)) capturedPointers.add(e.pointerId);
      updatePointer(e);
      startX = e.clientX;
      startY = e.clientY;
      if (e.pointerType === "touch") {
        const gesture = touchGesture();
        if (gesture) {
          mode = "pan";
          touchStartZoom = viewportRef.current.zoom;
          touchStartPanX = viewportRef.current.panX;
          touchStartPanY = viewportRef.current.panY;
          touchStartDistance = gesture.distance;
          touchStartCenterX = gesture.centerX;
          touchStartCenterY = gesture.centerY;
          touchStartLayout = layoutNow();
          return;
        }
        mode = "crosshair";
        updateCrosshairFrom(e);
        return;
      }
      if (e.button === 2 || (e.button === 0 && e.shiftKey)) {
        mode = "window";
        startWinLevel = base.display.win.level;
        startWinWidth = base.display.win.width;
      } else if (e.button === 1 || (e.button === 0 && keyState.space)) {
        mode = "pan";
        startPanX = viewportRef.current.panX;
        startPanY = viewportRef.current.panY;
      } else if (e.button === 0) {
        mode = "crosshair";
        updateCrosshairFrom(e);
      }
    };

    const publishHover = (e: PointerEvent): void => {
      const layout = layoutNow();
      if (!layout) return;
      const rect = canvasRect();
      const w = canvasToWorldVoxel({
        layout,
        canvasX: e.clientX - rect.left,
        canvasY: e.clientY - rect.top,
      });
      const state = useViewerStore.getState();
      if (!w) {
        if (state.hover?.plane === plane) state.setHover(null);
        return;
      }
      const cross = state.cross;
      const hAxis = layout.geom.hAxis;
      const vAxis = layout.geom.vAxis;
      const pick = (axis: 0 | 1 | 2): number => {
        if (axis === hAxis) return w.hWorld;
        if (axis === vAxis) return w.vWorld;
        if (axis === 0) return cross.r;
        if (axis === 1) return cross.a;
        return cross.s;
      };
      state.setHover({
        plane,
        r: pick(0),
        a: pick(1),
        s: pick(2),
      });
    };

    const onPointerMove = (e: PointerEvent): void => {
      updatePointer(e);
      const state = useViewerStore.getState();
      const base = state.base;
      if (!base) return;

      if (e.pointerType === "touch") {
        const gesture = touchGesture();
        if (gesture) {
          mode = "pan";
          const before = touchStartLayout ?? layoutNow();
          if (!before) return;
          const zoomFactor = gesture.distance / touchStartDistance;
          viewportRef.current.zoom = clamp(touchStartZoom * zoomFactor, ZOOM_MIN, ZOOM_MAX);
          const after = layoutNow();
          if (!after) return;
          const dx = gesture.centerX - touchStartCenterX;
          const dy = gesture.centerY - touchStartCenterY;
          viewportRef.current.panX =
            touchStartPanX +
            dx +
            (gesture.centerX - before.originX) * (1 - after.displayWidth / before.displayWidth);
          viewportRef.current.panY =
            touchStartPanY +
            dy +
            (gesture.centerY - before.originY) * (1 - after.displayHeight / before.displayHeight);
          requestRender(false);
          return;
        }
        mode = "crosshair";
      }

      if (mode === "crosshair") {
        updateCrosshairFrom(e);
        return;
      }
      if (mode === "window") {
        const active = selectActiveLayer(state);
        const stats = active ? state.getStatsForLayer(active.id) : null;
        const span = stats ? stats.max - stats.min || 1 : 1;
        const rect = canvasRect();
        const dw = ((e.clientX - startX) / rect.width) * span * 1.4;
        const dl = -((e.clientY - startY) / rect.height) * span * 1.4;
        state.setActiveWindow({
          level: startWinLevel + dl,
          width: Math.max(1e-6, startWinWidth + dw),
        });
        return;
      }
      if (mode === "pan") {
        viewportRef.current.panX = startPanX + (e.clientX - startX);
        viewportRef.current.panY = startPanY + (e.clientY - startY);
        requestRender(false);
        return;
      }
      // Idle hover (no button held) — publish hover-only probe.
      publishHover(e);
    };

    const onPointerLeave = (): void => {
      const state = useViewerStore.getState();
      if (state.hover?.plane === plane) state.setHover(null);
    };

    const endMode = (): void => {
      mode = null;
    };

    const onWheel = (e: WheelEvent): void => {
      const { base, cross } = useViewerStore.getState();
      if (!base) return;
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        const before = layoutNow();
        if (!before) return;
        viewportRef.current.zoom = clamp(viewportRef.current.zoom * factor, ZOOM_MIN, ZOOM_MAX);
        const after = layoutNow();
        if (!after) return;
        const rect = canvasRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        viewportRef.current.panX +=
          (mx - before.originX) * (1 - after.displayWidth / before.displayWidth);
        viewportRef.current.panY +=
          (my - before.originY) * (1 - after.displayHeight / before.displayHeight);
        requestRender(false);
      } else {
        const dir = e.deltaY > 0 ? 1 : -1;
        useViewerStore
          .getState()
          .setCross(
            plane === "axial"
              ? { s: cross.s + dir }
              : plane === "coronal"
                ? { a: cross.a + dir }
                : { r: cross.r + dir },
          );
      }
    };

    const onContextMenu = (e: MouseEvent): void => {
      e.preventDefault();
    };

    const onPointerUp = (e: PointerEvent): void => {
      removePointer(e);
      releasePointer(e.pointerId);
      if (pointers.size < 2) touchStartLayout = null;
      endMode();
    };

    const onPointerCancel = (e: PointerEvent): void => {
      removePointer(e);
      releasePointer(e.pointerId);
      if (pointers.size < 2) touchStartLayout = null;
      endMode();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("contextmenu", onContextMenu);
    // Use a non-passive listener so we can preventDefault on wheel.
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      for (const pointerId of capturedPointers) releasePointer(pointerId);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [plane, canvasRef, viewportRef, requestRender]);
}
