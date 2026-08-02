import { describe, expect, it } from "vitest";

import {
  invertAffine,
  mul4x4,
  worldToBaseVoxelMatrix,
  worldToOverlayMatrix,
} from "@/lib/geometry/overlayResample";
import { parseNiftiBuffer } from "@/lib/imaging/nifti/adapter";
import type { Volume } from "@/lib/imaging/types";

import { buildNifti1Buffer } from "../../fixtures/nifti";

function tinyRas(): Volume {
  // 3 (R) x 4 (A) x 5 (S) volume with identity affine. Values 0..N-1.
  const nx = 3,
    ny = 4,
    nz = 5;
  const data = new Float32Array(nx * ny * nz);
  for (let i = 0; i < data.length; i++) data[i] = i;
  const buf = buildNifti1Buffer({
    nx,
    ny,
    nz,
    datatypeCode: 16,
    data,
    sform: [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ],
  });
  return parseNiftiBuffer(buf, "ras.nii");
}

function flippedRasOnX(): Volume {
  // Voxel x increases means moving in -R; affine encodes this and offsets x so
  // the world coverage matches the RAS volume (voxel 0 ↔ world R=nx-1).
  const nx = 3,
    ny = 4,
    nz = 5;
  const data = new Float32Array(nx * ny * nz);
  for (let i = 0; i < data.length; i++) data[i] = i;
  const buf = buildNifti1Buffer({
    nx,
    ny,
    nz,
    datatypeCode: 16,
    data,
    sform: [
      [-1, 0, 0, nx - 1],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ],
  });
  return parseNiftiBuffer(buf, "las.nii");
}

describe("invertAffine", () => {
  it("inverts an identity-with-translation affine", () => {
    const m = new Float32Array([1, 0, 0, 5, 0, 1, 0, -3, 0, 0, 1, 2, 0, 0, 0, 1]);
    const inv = invertAffine(m);
    // Multiplying should give identity.
    const I = mul4x4(m, inv);
    expect(I[0]).toBeCloseTo(1);
    expect(I[5]).toBeCloseTo(1);
    expect(I[10]).toBeCloseTo(1);
    expect(I[15]).toBeCloseTo(1);
    expect(I[3]).toBeCloseTo(0);
    expect(I[7]).toBeCloseTo(0);
    expect(I[11]).toBeCloseTo(0);
  });

  it("returns identity for a singular matrix", () => {
    const m = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    const inv = invertAffine(m);
    expect(inv[0]).toBe(1);
    expect(inv[5]).toBe(1);
    expect(inv[10]).toBe(1);
  });
});

describe("worldToBaseVoxelMatrix", () => {
  it("is identity for a pure RAS volume", () => {
    const vol = tinyRas();
    const M = worldToBaseVoxelMatrix(vol);
    // Should be 4x4 identity (the world axes already match voxel axes).
    expect(Array.from(M.slice(0, 4))).toEqual([1, 0, 0, 0]);
    expect(Array.from(M.slice(4, 8))).toEqual([0, 1, 0, 0]);
    expect(Array.from(M.slice(8, 12))).toEqual([0, 0, 1, 0]);
  });

  it("flips and offsets when the voxel x axis points -R", () => {
    const vol = flippedRasOnX();
    expect(vol.orientCode).toBe("LAS");
    const M = worldToBaseVoxelMatrix(vol);
    // World R=0 should map to base voxel x = nx-1 = 2.
    expect(M[0]).toBe(-1);
    expect(M[3]).toBe(vol.nx - 1);
  });
});

describe("worldToOverlayMatrix", () => {
  it("is identity when base and overlay share the same affine", () => {
    const base = tinyRas();
    const overlay = tinyRas();
    const M = worldToOverlayMatrix(base, overlay);
    // World R=2, A=3, S=4 → overlay voxel (2, 3, 4)
    const wr = 2,
      wa = 3,
      ws = 4;
    const ox = M[0]! * wr + M[1]! * wa + M[2]! * ws + M[3]!;
    const oy = M[4]! * wr + M[5]! * wa + M[6]! * ws + M[7]!;
    const oz = M[8]! * wr + M[9]! * wa + M[10]! * ws + M[11]!;
    expect(ox).toBeCloseTo(2);
    expect(oy).toBeCloseTo(3);
    expect(oz).toBeCloseTo(4);
  });

  it("flips x when the overlay's x axis points -R", () => {
    const base = tinyRas();
    const overlay = flippedRasOnX();
    const M = worldToOverlayMatrix(base, overlay);
    // World R=0 — should map to overlay voxel x = nx-1 = 2.
    const ox0 = M[3]!;
    expect(Math.round(ox0)).toBe(overlay.nx - 1);
    // World R=2 — should map to overlay voxel x = 0.
    const ox2 = M[0]! * 2 + M[3]!;
    expect(Math.round(ox2)).toBe(0);
  });
});
