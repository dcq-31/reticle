import { describe, expect, it } from "vitest";

import { buildAffine, orientationFromAffine, orientCode } from "@/lib/imaging/nifti/affine";
import type { NiftiHeader } from "@/lib/imaging/nifti/header";
import { entryFor } from "@/lib/imaging/nifti/datatypes";

function baseHeader(over: Partial<NiftiHeader> = {}): NiftiHeader {
  return {
    isV2: false,
    littleEndian: true,
    datatypeCode: 16,
    bitpix: 32,
    dim: [3, 4, 5, 6, 1, 1, 1, 1],
    pixdim: [1, 1.2, 1.3, 1.4, 0, 0, 0, 0],
    voxOffset: 352,
    sclSlope: 1,
    sclInter: 0,
    calMin: 0,
    calMax: 0,
    qformCode: 0,
    sformCode: 0,
    quatern: [0, 0, 0],
    qoffset: [0, 0, 0],
    srow: [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    descrip: "",
    nx: 4,
    ny: 5,
    nz: 6,
    nt: 1,
    entry: entryFor(16),
    ...over,
  };
}

describe("buildAffine", () => {
  it("uses sform when sform_code > 0", () => {
    const h = baseHeader({
      sformCode: 1,
      srow: [
        [2, 0, 0, -10],
        [0, 2, 0, -20],
        [0, 0, 2, -30],
      ],
    });
    const aff = buildAffine(h);
    expect(Array.from(aff.slice(0, 4))).toEqual([2, 0, 0, -10]);
    expect(Array.from(aff.slice(4, 8))).toEqual([0, 2, 0, -20]);
    expect(Array.from(aff.slice(8, 12))).toEqual([0, 0, 2, -30]);
    expect(Array.from(aff.slice(12, 16))).toEqual([0, 0, 0, 1]);
  });

  it("falls back to pixdim when neither sform nor qform are set", () => {
    const h = baseHeader();
    const aff = buildAffine(h);
    expect(aff[0]).toBeCloseTo(1.2);
    expect(aff[5]).toBeCloseTo(1.3);
    expect(aff[10]).toBeCloseTo(1.4);
    expect(aff[15]).toBe(1);
  });

  it("builds an identity rotation from a zero quaternion (qform)", () => {
    const h = baseHeader({
      qformCode: 1,
      quatern: [0, 0, 0], // a = 1
      qoffset: [-5, -6, -7],
    });
    const aff = buildAffine(h);
    // expect a diagonal matrix scaled by pixdim with the qoffset translation
    expect(aff[0]).toBeCloseTo(1.2);
    expect(aff[5]).toBeCloseTo(1.3);
    expect(aff[10]).toBeCloseTo(1.4);
    expect(aff[3]).toBeCloseTo(-5);
    expect(aff[7]).toBeCloseTo(-6);
    expect(aff[11]).toBeCloseTo(-7);
  });
});

describe("orientationFromAffine", () => {
  function affFromRows(
    r0: readonly number[],
    r1: readonly number[],
    r2: readonly number[],
  ): Float32Array {
    const out = new Float32Array(16);
    [...r0, ...r1, ...r2].forEach((v, i) => (out[i] = v));
    out[15] = 1;
    return out;
  }

  it("identifies pure RAS", () => {
    const aff = affFromRows([1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]);
    const { perm, sgn } = orientationFromAffine(aff);
    expect(perm).toEqual([0, 1, 2]);
    expect(sgn).toEqual([1, 1, 1]);
    expect(orientCode(perm, sgn)).toBe("RAS");
  });

  it("flips R to L when the first column is negative", () => {
    const aff = affFromRows([-1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]);
    const { perm, sgn } = orientationFromAffine(aff);
    expect(orientCode(perm, sgn)).toBe("LAS");
  });

  it("recognizes a swapped voxel order (LPS)", () => {
    // Voxel axis 0 -> -R, axis 1 -> -A, axis 2 -> +S
    const aff = affFromRows([-1, 0, 0, 0], [0, -1, 0, 0], [0, 0, 1, 0]);
    const { perm, sgn } = orientationFromAffine(aff);
    expect(orientCode(perm, sgn)).toBe("LPS");
  });

  it("handles axis permutation (e.g. ARS via column swap)", () => {
    // R world axis aligned with voxel axis 1, A with voxel axis 0
    const aff = affFromRows([0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 1, 0]);
    const { perm, sgn } = orientationFromAffine(aff);
    expect(perm).toEqual([1, 0, 2]);
    expect(sgn).toEqual([1, 1, 1]);
    expect(orientCode(perm, sgn)).toBe("ARS");
  });

  it("absorbs anisotropic scaling without changing orientation", () => {
    const aff = affFromRows([2.5, 0, 0, 0], [0, 1.3, 0, 0], [0, 0, 0.8, 0]);
    const { perm, sgn } = orientationFromAffine(aff);
    expect(orientCode(perm, sgn)).toBe("RAS");
  });
});
