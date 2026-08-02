import { describe, expect, it } from "vitest";

import { parseNiftiBuffer } from "@/lib/imaging/nifti/adapter";
import { computeStats } from "@/lib/imaging/nifti/volume";

import { buildNifti1Buffer } from "../../../fixtures/nifti";

describe("parseNiftiBuffer", () => {
  it("round-trips a tiny float32 volume", () => {
    const data = new Float32Array(2 * 3 * 4);
    for (let i = 0; i < data.length; i++) data[i] = i * 0.5;
    const buf = buildNifti1Buffer({
      nx: 2,
      ny: 3,
      nz: 4,
      datatypeCode: 16,
      data,
      sform: [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
      ],
    });
    const vol = parseNiftiBuffer(buf, "tiny.nii");

    expect(vol.source).toBe("nifti");
    expect(vol.name).toBe("tiny.nii");
    expect(vol.nx).toBe(2);
    expect(vol.ny).toBe(3);
    expect(vol.nz).toBe(4);
    expect(vol.nt).toBe(1);
    expect(vol.datatype).toBe("float32");
    expect(vol.orientCode).toBe("RAS");

    // Each voxel survives the read.
    expect(vol.data[0]).toBeCloseTo(0);
    expect(vol.data[5]).toBeCloseTo(2.5);
    expect(vol.data[vol.data.length - 1]).toBeCloseTo((vol.data.length - 1) * 0.5);
  });

  it("reads big-endian data correctly", () => {
    const elements = 2 * 2 * 2;
    const data = new Int16Array(elements);
    for (let i = 0; i < elements; i++) data[i] = (i + 1) * 100;
    const buf = buildNifti1Buffer({
      nx: 2,
      ny: 2,
      nz: 2,
      datatypeCode: 4,
      data,
      littleEndian: false,
      sform: [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
      ],
    });
    const vol = parseNiftiBuffer(buf, "be.nii");
    expect(Array.from(vol.data as Int16Array)).toEqual([100, 200, 300, 400, 500, 600, 700, 800]);
  });

  it("computeStats returns correct min/max and a populated histogram", () => {
    const data = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const buf = buildNifti1Buffer({
      nx: 2,
      ny: 2,
      nz: 2,
      datatypeCode: 16,
      data,
      sform: [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
      ],
    });
    const vol = parseNiftiBuffer(buf, "stats.nii");
    const stats = computeStats(vol, 0);

    expect(stats.min).toBe(0);
    expect(stats.max).toBe(7);
    expect(stats.histogram.length).toBe(256);
    const sum = stats.histogram.reduce((acc, v) => acc + v, 0);
    expect(sum).toBe(data.length);
    expect(stats.p2).toBeGreaterThanOrEqual(0);
    expect(stats.p98).toBeLessThanOrEqual(7);
    expect(stats.p2).toBeLessThanOrEqual(stats.p98);
  });
});
