import type { Volume } from "@/lib/imaging/types";

export type WorldAxis = 0 | 1 | 2;

/**
 * Flat-array offset for a coordinate `c` along world axis `w`.
 * Accounts for the volume's voxel-axis sign so that the same world coordinate
 * always points to the same anatomical location, regardless of storage order.
 */
export function worldOff(vol: Volume, w: WorldAxis, c: number): number {
  const pv = vol.perm[w]!;
  const st = vol.strides[pv]!;
  return vol.sgn[w]! > 0 ? c * st : (vol.dimsVox[pv]! - 1 - c) * st;
}

/** Signed step (in elements) for advancing one unit along world axis `w`. */
export function worldStep(vol: Volume, w: WorldAxis): number {
  const pv = vol.perm[w]!;
  const st = vol.strides[pv]!;
  return vol.sgn[w]! > 0 ? st : -st;
}

export interface ProbeResult {
  /** Voxel-index in storage order. */
  readonly voxel: readonly [number, number, number];
  /** World-space position in millimetres (RAS). */
  readonly world: readonly [number, number, number];
  /** Scaled voxel value at that position (sclSlope/sclInter applied). */
  readonly value: number;
}

/**
 * Sample the volume at world voxel coordinates `(r, a, s)` and time `t`.
 *
 * `(r, a, s)` are integer voxel indices in the world (R, A, S) frame —
 * the same frame the crosshair lives in.
 */
export function probe(vol: Volume, r: number, a: number, s: number, t = 0): ProbeResult {
  if (
    r < 0 ||
    r >= vol.dimsWorld[0] ||
    a < 0 ||
    a >= vol.dimsWorld[1] ||
    s < 0 ||
    s >= vol.dimsWorld[2]
  ) {
    throw new RangeError(`probe coordinates out of range: (${r}, ${a}, ${s})`);
  }
  const lastT = Math.max(1, vol.nt) - 1;
  if (t < 0 || t > lastT) {
    throw new RangeError(`probe time index out of range: ${t} (max ${lastT})`);
  }
  const cw: readonly [number, number, number] = [r, a, s];
  const vx: [number, number, number] = [0, 0, 0];
  for (let w = 0; w < 3; w++) {
    const ww = w as WorldAxis;
    const pv = vol.perm[ww]!;
    vx[pv] = vol.sgn[ww]! > 0 ? cw[ww]! : vol.dimsVox[pv]! - 1 - cw[ww]!;
  }

  const aff = vol.affine;
  const wx = aff[0]! * vx[0] + aff[1]! * vx[1] + aff[2]! * vx[2] + aff[3]!;
  const wy = aff[4]! * vx[0] + aff[5]! * vx[1] + aff[6]! * vx[2] + aff[7]!;
  const wz = aff[8]! * vx[0] + aff[9]! * vx[1] + aff[10]! * vx[2] + aff[11]!;

  const flat = vx[0] + vx[1] * vol.strides[1]! + vx[2] * vol.strides[2]! + t * vol.strides[3]!;
  const value = vol.data[flat]! * vol.sclSlope + vol.sclInter;

  return { voxel: [vx[0], vx[1], vx[2]], world: [wx, wy, wz], value };
}
