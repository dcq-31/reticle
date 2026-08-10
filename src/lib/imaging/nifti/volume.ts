import type { TypedArray, Vec3, Vec4, Volume, VolumeStats } from "@/lib/imaging/types";
import type { NiftiHeader } from "@/lib/imaging/nifti/header";
import { buildAffine, orientationFromAffine, orientCode } from "@/lib/imaging/nifti/affine";

/** Histogram bin count for `computeStats`. */
export const STATS_BINS = 256;

/** Quantiles used as the auto-window robust bounds. */
const P_LO = 0.02;
const P_HI = 0.98;

function spacingFromAffine(
  aff: Float32Array,
  perm: readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2],
): Vec3 {
  const colNorm = (j: 0 | 1 | 2): number => {
    const a0 = aff[j]!;
    const a1 = aff[4 + j]!;
    const a2 = aff[8 + j]!;
    return Math.hypot(a0, a1, a2) || 1;
  };
  return [colNorm(perm[0]), colNorm(perm[1]), colNorm(perm[2])];
}

export interface MakeVolumeOptions {
  readonly id?: string;
  readonly details?: Readonly<Record<string, string>>;
}

/**
 * Generate a unique volume id. Uses `crypto.randomUUID()` when available so
 * volumes built in a Web Worker don't collide with main-thread volumes when
 * they meet in the store. Falls back to a counter for older environments.
 */
let fallbackSeq = 1;
function freshVolumeId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `vol-${c.randomUUID()}`;
  return `vol-${String(fallbackSeq++).padStart(4, "0")}`;
}

export function makeVolume(
  h: NiftiHeader,
  data: TypedArray,
  name: string,
  opts: MakeVolumeOptions = {},
): Volume {
  const affine = buildAffine(h);
  const { perm, sgn } = orientationFromAffine(affine);
  const spacing = spacingFromAffine(affine, perm);

  const dimsVox: Vec3 = [h.nx, h.ny, h.nz];
  const dimsWorld: Vec3 = [dimsVox[perm[0]], dimsVox[perm[1]], dimsVox[perm[2]]];
  const strides: Vec4 = [1, h.nx, h.nx * h.ny, h.nx * h.ny * h.nz];

  const id = opts.id ?? freshVolumeId();

  return {
    id,
    name,
    source: "nifti",
    nx: h.nx,
    ny: h.ny,
    nz: h.nz,
    nt: h.nt,
    dimsVox,
    dimsWorld,
    spacing,
    perm,
    sgn,
    affine,
    orientCode: orientCode(perm, sgn),
    datatype: h.entry.name,
    data,
    strides,
    sclSlope: h.sclSlope,
    sclInter: h.sclInter,
    ...(opts.details !== undefined ? { details: opts.details } : {}),
  };
}

/**
 * Scan voxels at time-index `t`, computing min/max, 256-bin histogram, and
 * robust 2nd/98th percentile bounds for auto windowing.
 *
 * Pure: returns a new `VolumeStats`. Callers wishing to cache should store
 * the result in a derived-data cache keyed by volume id and time index.
 */
export function computeStats(vol: Volume, t = 0): VolumeStats {
  const data = vol.data;
  const slope = vol.sclSlope;
  const inter = vol.sclInter;
  const nVox = vol.nx * vol.ny * vol.nz;
  const start = t * vol.strides[3];

  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < nVox; i++) {
    const v = data[start + i]! * slope + inter;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  if (!Number.isFinite(mn)) {
    mn = 0;
    mx = 1;
  }
  if (mx <= mn) mx = mn + 1;

  const bins = STATS_BINS;
  const span = mx - mn;
  const histogram = new Uint32Array(bins);
  const scale = (bins - 1) / span;
  for (let i = 0; i < nVox; i++) {
    let b = (data[start + i]! * slope + inter - mn) * scale;
    if (b < 0) b = 0;
    else if (b > bins - 1) b = bins - 1;
    histogram[b | 0]!++;
  }

  const pct = (target: number): number => {
    let acc = 0;
    for (let b = 0; b < bins; b++) {
      acc += histogram[b]!;
      if (acc >= target) return mn + ((b + 0.5) / bins) * span;
    }
    return mx;
  };

  return {
    min: mn,
    max: mx,
    p2: pct(nVox * P_LO),
    p98: pct(nVox * P_HI),
    histogram,
  };
}
