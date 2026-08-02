import { planeSizes, type Convention, type Plane, type PlaneGeometry } from "@/lib/geometry/planes";
import type { Volume } from "@/lib/imaging/types";

export interface ViewportState {
  /** User zoom factor (1 = fit-to-cell). */
  zoom: number;
  /** Pixels of pan applied to the displayed image. */
  panX: number;
  panY: number;
}

export interface CanvasSize {
  /** Canvas CSS width / height in pixels (logical, not DPR-scaled). */
  readonly width: number;
  readonly height: number;
}

export interface ViewLayout {
  readonly sizeH: number;
  readonly sizeV: number;
  readonly geom: PlaneGeometry;
  /** Width of the displayed slice rectangle in canvas pixels. */
  readonly displayWidth: number;
  readonly displayHeight: number;
  /** Top-left of the displayed slice in canvas pixels. */
  readonly originX: number;
  readonly originY: number;
}

/**
 * Compute the on-canvas display rectangle for a plane.
 *
 * Fit factor is `min(canvas/physW, canvas/physH) * 0.96` where physW/H are
 * the millimetre extents (so cells with anisotropic voxel spacing display
 * with correct aspect ratio). User zoom and pan are layered on top.
 */
export function viewLayout(
  volume: Volume,
  plane: Plane,
  convention: Convention,
  canvas: CanvasSize,
  viewport: ViewportState,
): ViewLayout {
  const { sizeH, sizeV, geom } = planeSizes(volume, plane, convention);
  const physW = sizeH * volume.spacing[geom.hAxis]!;
  const physH = sizeV * volume.spacing[geom.vAxis]!;
  const fit = Math.min(canvas.width / physW, canvas.height / physH) * 0.96;
  const displayWidth = physW * fit * viewport.zoom;
  const displayHeight = physH * fit * viewport.zoom;
  const originX = canvas.width / 2 - displayWidth / 2 + viewport.panX;
  const originY = canvas.height / 2 - displayHeight / 2 + viewport.panY;
  return { sizeH, sizeV, geom, displayWidth, displayHeight, originX, originY };
}

export interface WorldFromCanvasArgs {
  readonly layout: ViewLayout;
  readonly canvasX: number;
  readonly canvasY: number;
}

/**
 * Inverse of `viewLayout` rendering: turn a canvas-space pointer position
 * into the world (R, A, S) voxel indices the plane displays.
 *
 * Returns `null` when the point lies outside the slice rectangle.
 */
export function canvasToWorldVoxel(
  args: WorldFromCanvasArgs,
): { hWorld: number; vWorld: number } | null {
  const { layout, canvasX, canvasY } = args;
  const hPx = Math.round(((canvasX - layout.originX) / layout.displayWidth) * layout.sizeH - 0.5);
  const vPx = Math.round(((canvasY - layout.originY) / layout.displayHeight) * layout.sizeV - 0.5);
  if (hPx < 0 || hPx >= layout.sizeH || vPx < 0 || vPx >= layout.sizeV) return null;
  const hWorld = layout.geom.flipH ? layout.sizeH - 1 - hPx : hPx;
  const vWorld = layout.geom.flipV ? layout.sizeV - 1 - vPx : vPx;
  return { hWorld, vWorld };
}
