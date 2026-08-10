import { Data3DTexture, LinearFilter, RedFormat, UnsignedByteType } from "three";

import { worldOff } from "@/lib/geometry/worldVoxel";
import type { Volume, VolumeStats } from "@/lib/imaging/types";

/** Max number of voxels along any axis we let the 3D texture grow to. */
export const VOLUME_TEXTURE_LIMIT = 256;

/**
 * Box-local axis layout (matches the GLSL shader):
 *   x → world R (axis 0)
 *   y → world S (axis 2)  — "up" in scene space
 *   z → world A (axis 1)
 */
export interface BuiltVolumeTexture {
  readonly texture: Data3DTexture;
  readonly dims: readonly [number, number, number];
  /** Physical box dims (mm), with the longest axis normalised to 1. */
  readonly aspect: readonly [number, number, number];
  /** Pre-window volume value range, for the shader to denormalise samples. */
  readonly volMin: number;
  readonly volRange: number;
  /** Downsample factor that was applied (1 = no downsample). */
  readonly downsample: number;
}

/**
 * Build a 3D R8 texture from `volume` at time index `t`. Downsamples evenly
 * across axes when the largest axis exceeds VOLUME_TEXTURE_LIMIT — the
 * shader's per-fragment dither hides most of the visual cost.
 *
 * Note: callers must dispose the previous texture (`tex.dispose()`) before
 * replacing it.
 */
export function buildVolumeTexture(volume: Volume, stats: VolumeStats, t = 0): BuiltVolumeTexture {
  const RW = volume.dimsWorld[0];
  const AH = volume.dimsWorld[1];
  const SD = volume.dimsWorld[2];
  const maxAxis = Math.max(RW, AH, SD);
  const downsample = Math.max(1, Math.ceil(maxAxis / VOLUME_TEXTURE_LIMIT));

  const dx = Math.ceil(RW / downsample);
  const dy = Math.ceil(SD / downsample);
  const dz = Math.ceil(AH / downsample);

  // Per-axis flat-offset lookup tables (canonical world order: R=0, A=1, S=2).
  const offR = new Int32Array(RW);
  const offA = new Int32Array(AH);
  const offS = new Int32Array(SD);
  for (let i = 0; i < RW; i++) offR[i] = worldOff(volume, 0, i);
  for (let j = 0; j < AH; j++) offA[j] = worldOff(volume, 1, j);
  for (let k = 0; k < SD; k++) offS[k] = worldOff(volume, 2, k);

  const data = volume.data;
  const slope = volume.sclSlope;
  const inter = volume.sclInter;
  const tBase = t * volume.strides[3];
  const mn = stats.min;
  const range = stats.max - stats.min || 1;
  const scale = 255 / range;

  const out = new Uint8Array(dx * dy * dz);
  let p = 0;
  for (let oz = 0; oz < dz; oz++) {
    const ja = Math.min(oz * downsample, AH - 1);
    const offAj = offA[ja]!;
    for (let oy = 0; oy < dy; oy++) {
      const ks = Math.min(oy * downsample, SD - 1);
      const offSk = offS[ks]!;
      for (let ox = 0; ox < dx; ox++) {
        const ir = Math.min(ox * downsample, RW - 1);
        let n = (data[offR[ir]! + offSk + offAj + tBase]! * slope + inter - mn) * scale;
        if (n < 0) n = 0;
        else if (n > 255) n = 255;
        out[p++] = n | 0;
      }
    }
  }

  const texture = new Data3DTexture(out, dx, dy, dz);
  texture.format = RedFormat;
  texture.type = UnsignedByteType;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  // Physical aspect (mm), max axis normalised to 1.
  const ex = RW * volume.spacing[0];
  const ey = SD * volume.spacing[2];
  const ez = AH * volume.spacing[1];
  const maxMm = Math.max(ex, ey, ez) || 1;

  return {
    texture,
    dims: [dx, dy, dz] as const,
    aspect: [ex / maxMm, ey / maxMm, ez / maxMm] as const,
    volMin: mn,
    volRange: range,
    downsample,
  };
}

/**
 * Convert the packed RGB LUT (256x3) into RGBA (256x4) bytes for a 2D
 * DataTexture. Three.js dropped RGBFormat in r137, so RGBA is the only
 * portable byte-aligned colour format for 1D lookup tables.
 */
export function lutBytesToRgba(lut: Uint8Array): Uint8Array {
  if (lut.length !== 256 * 3) {
    throw new Error(`lutBytesToRgba: expected 768 bytes, got ${lut.length}`);
  }
  const out = new Uint8Array(256 * 4);
  for (let i = 0, j = 0; i < lut.length; i += 3, j += 4) {
    out[j] = lut[i]!;
    out[j + 1] = lut[i + 1]!;
    out[j + 2] = lut[i + 2]!;
    out[j + 3] = 255;
  }
  return out;
}
