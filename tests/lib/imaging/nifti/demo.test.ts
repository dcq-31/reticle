import { describe, expect, it } from "vitest";

import { makeDemoVolume } from "@/lib/imaging/nifti/demo";
import { computeStats } from "@/lib/imaging/nifti/volume";

describe("makeDemoVolume", () => {
  it("produces a Volume with the expected shape and orientation", () => {
    const vol = makeDemoVolume(42);
    expect(vol.nx).toBe(140);
    expect(vol.ny).toBe(172);
    expect(vol.nz).toBe(146);
    expect(vol.nt).toBe(1);
    expect(vol.orientCode).toBe("RAS");
    expect(vol.spacing[0]).toBeCloseTo(1.2);
  });

  it("contains a non-trivial intensity range", () => {
    const vol = makeDemoVolume(42);
    const stats = computeStats(vol, 0);
    expect(stats.max).toBeGreaterThan(100); // brain/lesion intensities
    expect(stats.min).toBeLessThan(stats.max);
  });
});
