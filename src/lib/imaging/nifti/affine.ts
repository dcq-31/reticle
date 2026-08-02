import type { AxisPerm, AxisSign } from "@/lib/imaging/types";
import type { NiftiHeader } from "@/lib/imaging/nifti/header";

/**
 * Build the 4x4 row-major voxel-index -> RAS-millimeter affine.
 *
 * Priority follows the NIfTI-1 spec:
 *   1. sform (sformCode > 0)         — explicit 3x4 matrix in `srow`
 *   2. qform (qformCode > 0)         — quaternion + offsets + pixdim
 *   3. pixdim fallback (no rotation) — diagonal scaling only
 *
 * The bottom row of the returned matrix is always `[0, 0, 0, 1]`.
 */
export function buildAffine(h: NiftiHeader): Float32Array {
  const out = new Float32Array(16);
  out[15] = 1;

  if (h.sformCode > 0) {
    for (let r = 0; r < 3; r++) {
      const row = h.srow[r] as readonly [number, number, number, number];
      out[r * 4 + 0] = row[0];
      out[r * 4 + 1] = row[1];
      out[r * 4 + 2] = row[2];
      out[r * 4 + 3] = row[3];
    }
    return out;
  }

  if (h.qformCode > 0) {
    const [b, c, d] = h.quatern;
    const a2 = 1 - (b * b + c * c + d * d);
    const a = a2 < 1e-7 ? 0 : Math.sqrt(a2);
    const qfac = h.pixdim[0] < 0 ? -1 : 1;
    const dx = h.pixdim[1];
    const dy = h.pixdim[2];
    const dz = h.pixdim[3] * qfac;
    // 3x3 rotation derived from quaternion (b, c, d) with implicit a.
    const r00 = a * a + b * b - c * c - d * d;
    const r01 = 2 * (b * c - a * d);
    const r02 = 2 * (b * d + a * c);
    const r10 = 2 * (b * c + a * d);
    const r11 = a * a + c * c - b * b - d * d;
    const r12 = 2 * (c * d - a * b);
    const r20 = 2 * (b * d - a * c);
    const r21 = 2 * (c * d + a * b);
    const r22 = a * a + d * d - b * b - c * c;

    out[0] = r00 * dx;
    out[1] = r01 * dy;
    out[2] = r02 * dz;
    out[3] = h.qoffset[0];

    out[4] = r10 * dx;
    out[5] = r11 * dy;
    out[6] = r12 * dz;
    out[7] = h.qoffset[1];

    out[8] = r20 * dx;
    out[9] = r21 * dy;
    out[10] = r22 * dz;
    out[11] = h.qoffset[2];
    return out;
  }

  out[0] = h.pixdim[1] || 1;
  out[5] = h.pixdim[2] || 1;
  out[10] = h.pixdim[3] || 1;
  return out;
}

export type Orientation = { readonly perm: AxisPerm; readonly sgn: AxisSign };

/**
 * Greedy axis-alignment of the 3x3 rotation/scale block of an affine onto
 * the world (R, A, S) axes.
 *
 * Result semantics:
 *   - `perm[w]` is the voxel-axis index that best aligns with world axis `w`.
 *   - `sgn[w]` is `+1` if that voxel axis points the same way as the world
 *     axis, else `-1`.
 *
 * Picks the largest |M[w][v]| each round, then removes both the world and
 * voxel axis from contention — matches the original imperative algorithm.
 */
export function orientationFromAffine(aff: Float32Array): Orientation {
  const m = (w: 0 | 1 | 2, v: 0 | 1 | 2): number => aff[w * 4 + v]!;

  const usedV = [false, false, false];
  const usedW = [false, false, false];
  const perm: [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2] = [0, 0, 0];
  const sgn: [-1 | 1, -1 | 1, -1 | 1] = [1, 1, 1];

  for (let n = 0; n < 3; n++) {
    let best = -1;
    let bw: 0 | 1 | 2 = 0;
    let bv: 0 | 1 | 2 = 0;
    for (let w = 0; w < 3; w++) {
      if (usedW[w]) continue;
      for (let v = 0; v < 3; v++) {
        if (usedV[v]) continue;
        const mag = Math.abs(m(w as 0 | 1 | 2, v as 0 | 1 | 2));
        if (mag > best) {
          best = mag;
          bw = w as 0 | 1 | 2;
          bv = v as 0 | 1 | 2;
        }
      }
    }
    perm[bw] = bv;
    sgn[bw] = m(bw, bv) >= 0 ? 1 : -1;
    usedW[bw] = true;
    usedV[bv] = true;
  }
  return { perm, sgn };
}

/**
 * Three-letter orientation code (e.g. "RAS", "LPS"). Letter at position `i`
 * is what walking voxel-axis `i` in the positive direction means in world
 * (anatomical) terms.
 */
export function orientCode(perm: AxisPerm, sgn: AxisSign): string {
  const pos = ["R", "A", "S"] as const;
  const neg = ["L", "P", "I"] as const;
  const out: [string, string, string] = ["", "", ""];
  for (let w = 0; w < 3; w++) {
    const voxAxis = perm[w]!;
    out[voxAxis] = sgn[w]! > 0 ? pos[w]! : neg[w]!;
  }
  return out.join("");
}
