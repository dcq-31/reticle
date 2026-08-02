import { describe, expect, it } from "vitest";

import { planeGeom, planeSizes, PLANES, sliceCoord } from "@/lib/geometry/planes";
import { makeDemoVolume } from "@/lib/imaging/nifti/demo";

describe("planeGeom", () => {
  it("axial uses (R, A) horizontal/vertical and steps along S", () => {
    const g = planeGeom("axial", "neuro");
    expect(g.hAxis).toBe(0);
    expect(g.vAxis).toBe(1);
    expect(g.sliceAxis).toBe(2);
  });

  it("coronal uses (R, S) and steps along A", () => {
    const g = planeGeom("coronal", "neuro");
    expect(g.hAxis).toBe(0);
    expect(g.vAxis).toBe(2);
    expect(g.sliceAxis).toBe(1);
  });

  it("sagittal uses (A, S) and steps along R; flipH always true", () => {
    const g = planeGeom("sagittal", "neuro");
    expect(g.hAxis).toBe(1);
    expect(g.vAxis).toBe(2);
    expect(g.sliceAxis).toBe(0);
    expect(g.flipH).toBe(true);
  });

  it("radio convention flips axial/coronal horizontal but not sagittal", () => {
    expect(planeGeom("axial", "radio").flipH).toBe(true);
    expect(planeGeom("axial", "neuro").flipH).toBe(false);
    expect(planeGeom("coronal", "radio").flipH).toBe(true);
    expect(planeGeom("sagittal", "radio").flipH).toBe(true);
  });
});

describe("planeSizes", () => {
  it("matches dimsWorld for each plane", () => {
    const vol = makeDemoVolume(7);
    const [W, A, S] = vol.dimsWorld;
    expect(planeSizes(vol, "axial", "neuro")).toMatchObject({
      sizeH: W,
      sizeV: A,
      nSlices: S,
    });
    expect(planeSizes(vol, "coronal", "neuro")).toMatchObject({
      sizeH: W,
      sizeV: S,
      nSlices: A,
    });
    expect(planeSizes(vol, "sagittal", "neuro")).toMatchObject({
      sizeH: A,
      sizeV: S,
      nSlices: W,
    });
  });
});

describe("sliceCoord", () => {
  const cross = { r: 10, a: 20, s: 30, t: 0 };
  it.each(PLANES)("returns the matching world coordinate for %s", (plane) => {
    const expected = plane === "axial" ? 30 : plane === "coronal" ? 20 : 10;
    expect(sliceCoord(cross, plane)).toBe(expected);
  });
});
