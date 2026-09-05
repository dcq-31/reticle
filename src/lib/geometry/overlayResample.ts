import type { Volume } from "@/lib/imaging/types";

/**
 * Compute the 4x4 matrix that maps world-voxel-RAS coordinates (the same
 * frame the crosshair lives in) to overlay-voxel indices.
 *
 * Composition:
 *   M = inv(overlay.affine) · base.affine · world_to_base_voxel
 *
 * where `world_to_base_voxel` accounts for `base.perm` / `base.sgn` so a
 * world coord of `(r, a, s)` becomes the right base voxel `(i, j, k)`
 * before being lifted to millimetres.
 *
 * Output is row-major (`out[r*4 + c]`). Falls back to identity when the
 * overlay's affine is singular (shouldn't happen in well-formed NIfTI).
 */
export function worldToOverlayMatrix(
  base: Volume,
  overlay: Volume,
  out?: Float32Array,
): Float32Array {
  const W = worldToBaseVoxelMatrix(base);
  const baseTimesW = mul4x4(base.affine, W);
  const overlayInv = invertAffine(overlay.affine);
  return mul4x4(overlayInv, baseTimesW, out);
}

/**
 * Permutation+sign+flip transform that maps a world voxel index `(r, a, s)`
 * to a base voxel index `(i, j, k)`. Bottom row is `[0,0,0,1]`.
 */
export function worldToBaseVoxelMatrix(base: Volume): Float32Array {
  const out = new Float32Array(16);
  for (let w = 0; w < 3; w++) {
    const pv = base.perm[w]!;
    const sg = base.sgn[w]!;
    out[pv * 4 + w] = sg;
    out[pv * 4 + 3] = sg > 0 ? 0 : base.dimsVox[pv]! - 1;
  }
  out[15] = 1;
  return out;
}

/** Row-major 4x4 matrix multiply. */
export function mul4x4(a: Float32Array, b: Float32Array, out?: Float32Array): Float32Array {
  const result = out ?? new Float32Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      result[r * 4 + c] =
        a[r * 4 + 0]! * b[0 * 4 + c]! +
        a[r * 4 + 1]! * b[1 * 4 + c]! +
        a[r * 4 + 2]! * b[2 * 4 + c]! +
        a[r * 4 + 3]! * b[3 * 4 + c]!;
    }
  }
  return result;
}

/**
 * Invert a 4x4 *affine* (row-major) whose last row is `[0, 0, 0, 1]`.
 * Returns identity if the 3x3 block is singular (no NaN propagation).
 */
export function invertAffine(m: Float32Array): Float32Array {
  const r00 = m[0]!;
  const r01 = m[1]!;
  const r02 = m[2]!;
  const t0 = m[3]!;
  const r10 = m[4]!;
  const r11 = m[5]!;
  const r12 = m[6]!;
  const t1 = m[7]!;
  const r20 = m[8]!;
  const r21 = m[9]!;
  const r22 = m[10]!;
  const t2 = m[11]!;

  const cof00 = r11 * r22 - r12 * r21;
  const cof01 = r12 * r20 - r10 * r22;
  const cof02 = r10 * r21 - r11 * r20;
  const det = r00 * cof00 + r01 * cof01 + r02 * cof02;

  if (Math.abs(det) < 1e-12) {
    const id = new Float32Array(16);
    id[0] = 1;
    id[5] = 1;
    id[10] = 1;
    id[15] = 1;
    return id;
  }

  const invDet = 1 / det;
  const i00 = cof00 * invDet;
  const i01 = (r02 * r21 - r01 * r22) * invDet;
  const i02 = (r01 * r12 - r02 * r11) * invDet;
  const i10 = cof01 * invDet;
  const i11 = (r00 * r22 - r02 * r20) * invDet;
  const i12 = (r02 * r10 - r00 * r12) * invDet;
  const i20 = cof02 * invDet;
  const i21 = (r01 * r20 - r00 * r21) * invDet;
  const i22 = (r00 * r11 - r01 * r10) * invDet;

  const nt0 = -(i00 * t0 + i01 * t1 + i02 * t2);
  const nt1 = -(i10 * t0 + i11 * t1 + i12 * t2);
  const nt2 = -(i20 * t0 + i21 * t1 + i22 * t2);

  const out = new Float32Array(16);
  out[0] = i00;
  out[1] = i01;
  out[2] = i02;
  out[3] = nt0;
  out[4] = i10;
  out[5] = i11;
  out[6] = i12;
  out[7] = nt1;
  out[8] = i20;
  out[9] = i21;
  out[10] = i22;
  out[11] = nt2;
  out[15] = 1;
  return out;
}
