import type { Volume } from "@/lib/imaging/types";
import type { WorldAxis } from "@/lib/geometry/worldVoxel";

export type Plane = "axial" | "coronal" | "sagittal";
export type Convention = "neuro" | "radio";

export const PLANES = ["axial", "coronal", "sagittal"] as const satisfies readonly Plane[];

export interface PlaneGeometry {
  /** World axis displayed on the canvas horizontal. */
  readonly hAxis: WorldAxis;
  /** World axis displayed on the canvas vertical. */
  readonly vAxis: WorldAxis;
  /** World axis the user steps through with the slice slider. */
  readonly sliceAxis: WorldAxis;
  /** Whether to flip the displayed horizontal direction. */
  readonly flipH: boolean;
  /** Whether to flip the displayed vertical direction. */
  readonly flipV: boolean;
}

/**
 * Per-plane axis assignments and display flips.
 *
 * The radiological convention flips left/right on axial and coronal so that
 * the patient's right side appears on the viewer's left (radiology film).
 * The neurological convention shows the patient's left on the viewer's left.
 * Sagittal is always shown with anterior to the left and superior up.
 */
export function planeGeom(plane: Plane, convention: Convention): PlaneGeometry {
  const radio = convention === "radio";
  switch (plane) {
    case "axial":
      return { hAxis: 0, vAxis: 1, sliceAxis: 2, flipH: radio, flipV: true };
    case "coronal":
      return { hAxis: 0, vAxis: 2, sliceAxis: 1, flipH: radio, flipV: true };
    case "sagittal":
      return { hAxis: 1, vAxis: 2, sliceAxis: 0, flipH: true, flipV: true };
  }
}

export interface PlaneSizes {
  /** Pixel count along the horizontal voxel axis. */
  readonly sizeH: number;
  /** Pixel count along the vertical voxel axis. */
  readonly sizeV: number;
  /** Total number of slices in this plane's stack. */
  readonly nSlices: number;
  readonly geom: PlaneGeometry;
}

export function planeSizes(vol: Volume, plane: Plane, convention: Convention): PlaneSizes {
  const geom = planeGeom(plane, convention);
  return {
    sizeH: vol.dimsWorld[geom.hAxis]!,
    sizeV: vol.dimsWorld[geom.vAxis]!,
    nSlices: vol.dimsWorld[geom.sliceAxis]!,
    geom,
  };
}

export interface Crosshair {
  readonly r: number;
  readonly a: number;
  readonly s: number;
  readonly t: number;
}

/** World-axis coordinate that drives this plane's current slice. */
export function sliceCoord(cross: Crosshair, plane: Plane): number {
  switch (plane) {
    case "axial":
      return cross.s;
    case "coronal":
      return cross.a;
    case "sagittal":
      return cross.r;
  }
}
