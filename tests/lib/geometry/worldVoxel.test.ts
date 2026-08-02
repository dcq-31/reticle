import { describe, expect, it } from "vitest";

import { probe, worldOff, worldStep } from "@/lib/geometry/worldVoxel";
import { parseNiftiBuffer } from "@/lib/imaging/nifti/adapter";

import { buildNifti1Buffer } from "../../fixtures/nifti";

function rasVolume() {
  const nx = 3;
  const ny = 4;
  const nz = 5;
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

function lasVolume() {
  const nx = 3;
  const ny = 4;
  const nz = 5;
  const data = new Float32Array(nx * ny * nz);
  for (let i = 0; i < data.length; i++) data[i] = i;
  const buf = buildNifti1Buffer({
    nx,
    ny,
    nz,
    datatypeCode: 16,
    data,
    // Flip the R axis -> voxel x increases means moving in -R.
    sform: [
      [-1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ],
  });
  return parseNiftiBuffer(buf, "las.nii");
}

describe("worldOff / worldStep", () => {
  it("matches stride math on a pure RAS volume", () => {
    const vol = rasVolume();
    // World R=2 with stride 1 -> offset 2.
    expect(worldOff(vol, 0, 2)).toBe(2);
    expect(worldStep(vol, 0)).toBe(1);
    // World A=3 with stride nx=3 -> offset 9.
    expect(worldOff(vol, 1, 3)).toBe(9);
    expect(worldStep(vol, 1)).toBe(3);
  });

  it("flips offsets and signs when the voxel axis points the opposite way", () => {
    const vol = lasVolume();
    expect(vol.orientCode).toBe("LAS");
    // sgn[0] = -1; worldOff at R=0 = (nx-1)*stride = 2.
    expect(worldOff(vol, 0, 0)).toBe(2);
    expect(worldStep(vol, 0)).toBe(-1);
  });
});

describe("probe", () => {
  it("returns voxel/world/value at the origin of an RAS volume", () => {
    const vol = rasVolume();
    const p = probe(vol, 0, 0, 0, 0);
    expect(p.voxel).toEqual([0, 0, 0]);
    expect(p.world).toEqual([0, 0, 0]);
    expect(p.value).toBe(0);
  });

  it("walks to the opposite corner correctly", () => {
    const vol = rasVolume();
    const p = probe(vol, vol.dimsWorld[0] - 1, vol.dimsWorld[1] - 1, vol.dimsWorld[2] - 1, 0);
    expect(p.voxel).toEqual([vol.nx - 1, vol.ny - 1, vol.nz - 1]);
    expect(p.value).toBe(vol.nx * vol.ny * vol.nz - 1);
  });
});
