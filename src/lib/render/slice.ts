import { worldToOverlayMatrix } from "@/lib/geometry/overlayResample";
import { planeSizes, type Convention, type Plane } from "@/lib/geometry/planes";
import { worldOff, worldStep } from "@/lib/geometry/worldVoxel";
import type { Volume } from "@/lib/imaging/types";

export interface SliceOverlayInput {
  readonly volume: Volume;
  readonly winLow: number;
  readonly winWidth: number;
  readonly lut: Uint8Array;
  /** 0..1; controls how strongly the overlay obscures the base. */
  readonly opacity: number;
}

export interface SliceRenderInputs {
  /** Base layer's volume (drives geometry, fit, world-coord mapping). */
  readonly volume: Volume;
  readonly plane: Plane;
  readonly convention: Convention;
  /** Window/level applied to base voxels before the LUT. */
  readonly winLow: number;
  readonly winWidth: number;
  /** 256x3 packed RGB lookup table for the base. */
  readonly lut: Uint8Array;
  /** World-axis coordinate of the slice (e.g. `sliceCoord(cross, plane)`). */
  readonly slice: number;
  /** Frame index for 4D series; 0 for 3D. */
  readonly timeIndex: number;
  /** Optional overlays — composited on top of the base in array order. */
  readonly overlays?: readonly SliceOverlayInput[];
}

/**
 * Fill `imageData` with one slice of the base volume, then composite any
 * overlays on top. The caller owns `imageData` and must ensure its
 * dimensions match `planeSizes(volume, plane, convention)`.
 *
 * Hot path: the base pass runs unchanged when `overlays` is empty. Each
 * overlay adds one extra pass with nearest-neighbor resampling through a
 * precomputed `world → overlay-voxel` matrix.
 */
export function renderSliceToImageData(inputs: SliceRenderInputs, imageData: ImageData): void {
  const { volume, plane, convention, winLow, winWidth, lut, slice, timeIndex, overlays } = inputs;
  const { sizeH, sizeV, geom } = planeSizes(volume, plane, convention);

  if (imageData.width !== sizeH || imageData.height !== sizeV) {
    throw new Error(
      `ImageData ${imageData.width}x${imageData.height} does not match plane ${sizeH}x${sizeV}`,
    );
  }

  renderBasePass(imageData, volume, geom, sizeH, sizeV, winLow, winWidth, lut, slice, timeIndex);

  if (overlays && overlays.length > 0) {
    for (const overlay of overlays) {
      if (overlay.opacity <= 0) continue;
      compositeOverlay(imageData, volume, overlay, geom, sizeH, sizeV, slice, timeIndex);
    }
  }
}

function renderBasePass(
  imageData: ImageData,
  volume: Volume,
  geom: ReturnType<typeof planeSizes> extends { geom: infer G } ? G : never,
  sizeH: number,
  sizeV: number,
  winLow: number,
  winWidth: number,
  lut: Uint8Array,
  slice: number,
  timeIndex: number,
): void {
  const img = imageData.data;
  const data = volume.data;
  const slope = volume.sclSlope;
  const inter = volume.sclInter;
  const scale = winWidth > 1e-9 ? 255 / winWidth : 0;

  const baseOff = worldOff(volume, geom.sliceAxis, slice) + timeIndex * volume.strides[3]!;
  const stepH = worldStep(volume, geom.hAxis);
  const stepV = worldStep(volume, geom.vAxis);

  let p = 0;
  for (let py = 0; py < sizeV; py++) {
    const vc = geom.flipV ? sizeV - 1 - py : py;
    const rowBase = baseOff + vc * stepV;
    for (let px = 0; px < sizeH; px++) {
      const hc = geom.flipH ? sizeH - 1 - px : px;
      const raw = data[rowBase + hc * stepH]!;
      let n = (raw * slope + inter - winLow) * scale;
      if (n < 0) n = 0;
      else if (n > 255) n = 255;
      const ci = (n | 0) * 3;
      img[p] = lut[ci]!;
      img[p + 1] = lut[ci + 1]!;
      img[p + 2] = lut[ci + 2]!;
      img[p + 3] = 255;
      p += 4;
    }
  }
}

function compositeOverlay(
  imageData: ImageData,
  base: Volume,
  overlay: SliceOverlayInput,
  geom: ReturnType<typeof planeSizes> extends { geom: infer G } ? G : never,
  sizeH: number,
  sizeV: number,
  slice: number,
  timeIndex: number,
): void {
  const img = imageData.data;
  const ov = overlay.volume;
  const data = ov.data;
  const slope = ov.sclSlope;
  const inter = ov.sclInter;
  const scale = overlay.winWidth > 1e-9 ? 255 / overlay.winWidth : 0;
  const opacity = overlay.opacity;
  const lut = overlay.lut;

  const onx = ov.nx;
  const ony = ov.ny;
  const onz = ov.nz;
  const st1 = ov.strides[1];
  const st2 = ov.strides[2];
  const otBase = timeIndex * ov.strides[3];

  // world-to-overlay-voxel 4x4 matrix, row-major.
  const M = worldToOverlayMatrix(base, ov);
  // Per-axis column selectors so we can step along the plane's axes.
  const hAxis = geom.hAxis;
  const vAxis = geom.vAxis;
  const sAxis = geom.sliceAxis;
  const m0h = M[hAxis]!;
  const m1h = M[4 + hAxis]!;
  const m2h = M[8 + hAxis]!;
  const m0v = M[vAxis]!;
  const m1v = M[4 + vAxis]!;
  const m2v = M[8 + vAxis]!;
  const m0s = M[sAxis]!;
  const m1s = M[4 + sAxis]!;
  const m2s = M[8 + sAxis]!;
  const m0t = M[3]!;
  const m1t = M[7]!;
  const m2t = M[11]!;

  // Constant contribution from the slice + translation columns.
  const cx0 = m0s * slice + m0t;
  const cy0 = m1s * slice + m1t;
  const cz0 = m2s * slice + m2t;

  let p = 0;
  for (let py = 0; py < sizeV; py++) {
    const vc = geom.flipV ? sizeV - 1 - py : py;
    const rowCx = cx0 + m0v * vc;
    const rowCy = cy0 + m1v * vc;
    const rowCz = cz0 + m2v * vc;

    // Walk the row in pixel order, but apply flipH to the world h coord.
    const hStart = geom.flipH ? sizeH - 1 : 0;
    const hStep = geom.flipH ? -1 : 1;
    let ox = rowCx + m0h * hStart;
    let oy = rowCy + m1h * hStart;
    let oz = rowCz + m2h * hStart;

    for (let px = 0; px < sizeH; px++) {
      const xi = (ox + 0.5) | 0; // nearest-neighbor
      const yi = (oy + 0.5) | 0;
      const zi = (oz + 0.5) | 0;
      if (xi >= 0 && xi < onx && yi >= 0 && yi < ony && zi >= 0 && zi < onz) {
        const raw = data[xi + yi * st1 + zi * st2 + otBase]!;
        const v = raw * slope + inter;
        let n = (v - overlay.winLow) * scale;
        if (n > 0) {
          if (n > 255) n = 255;
          const ci = (n | 0) * 3;
          // alpha = opacity * normalized — fades in at winLow, opaque past winLow+winWidth.
          const a = opacity * (n / 255);
          const ia = 1 - a;
          img[p] = (lut[ci]! * a + img[p]! * ia) | 0;
          img[p + 1] = (lut[ci + 1]! * a + img[p + 1]! * ia) | 0;
          img[p + 2] = (lut[ci + 2]! * a + img[p + 2]! * ia) | 0;
        }
      }
      ox += m0h * hStep;
      oy += m1h * hStep;
      oz += m2h * hStep;
      p += 4;
    }
  }
}
