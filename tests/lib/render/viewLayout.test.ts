import { describe, expect, it } from "vitest";

import { parseNiftiBuffer } from "@/lib/imaging/nifti/adapter";
import type { Convention, Plane } from "@/lib/geometry/planes";
import type { Volume } from "@/lib/imaging/types";
import { canvasToWorldVoxel, viewLayout, type ViewLayout } from "@/lib/render/viewLayout";

import { buildNifti1Buffer } from "../../fixtures/nifti";

const CANVAS = { width: 400, height: 300 };
const NO_TRANSFORM = { zoom: 1, panX: 0, panY: 0 };

function makeVolume(spacing: readonly [number, number, number] = [1, 1, 1]): Volume {
  const nx = 8;
  const ny = 6;
  const nz = 4;
  return parseNiftiBuffer(
    buildNifti1Buffer({
      nx,
      ny,
      nz,
      datatypeCode: 16,
      data: new Float32Array(nx * ny * nz),
      sform: [
        [spacing[0], 0, 0, 0],
        [0, spacing[1], 0, 0],
        [0, 0, spacing[2], 0],
      ],
    }),
    "layout.nii",
  );
}

function centerOf(
  layout: ViewLayout,
  hWorld: number,
  vWorld: number,
): { canvasX: number; canvasY: number } {
  const hPx = layout.geom.flipH ? layout.sizeH - 1 - hWorld : hWorld;
  const vPx = layout.geom.flipV ? layout.sizeV - 1 - vWorld : vWorld;
  return {
    canvasX: layout.originX + ((hPx + 0.5) / layout.sizeH) * layout.displayWidth,
    canvasY: layout.originY + ((vPx + 0.5) / layout.sizeV) * layout.displayHeight,
  };
}

const PLANES: readonly Plane[] = ["axial", "coronal", "sagittal"];
const CONVENTIONS: readonly Convention[] = ["neuro", "radio"];

describe("viewLayout", () => {
  it("fits the slice inside the canvas with margin to spare", () => {
    const layout = viewLayout(makeVolume(), "axial", "neuro", CANVAS, NO_TRANSFORM);
    expect(layout.displayWidth).toBeLessThanOrEqual(CANVAS.width);
    expect(layout.displayHeight).toBeLessThanOrEqual(CANVAS.height);
    expect(layout.originX).toBeGreaterThanOrEqual(0);
    expect(layout.originY).toBeGreaterThanOrEqual(0);
  });

  it("preserves physical aspect ratio under anisotropic spacing", () => {
    const layout = viewLayout(makeVolume([2, 1, 1]), "axial", "neuro", CANVAS, NO_TRANSFORM);
    expect(layout.displayWidth / layout.displayHeight).toBeCloseTo(16 / 6, 5);
  });

  it("scales the display rect by zoom and offsets it by pan", () => {
    const volume = makeVolume();
    const base = viewLayout(volume, "axial", "neuro", CANVAS, NO_TRANSFORM);
    const zoomed = viewLayout(volume, "axial", "neuro", CANVAS, { zoom: 2, panX: 30, panY: -10 });

    expect(zoomed.displayWidth).toBeCloseTo(base.displayWidth * 2, 5);
    expect(zoomed.displayHeight).toBeCloseTo(base.displayHeight * 2, 5);
    expect(zoomed.originX).toBeCloseTo(base.originX - base.displayWidth / 2 + 30, 5);
    expect(zoomed.originY).toBeCloseTo(base.originY - base.displayHeight / 2 - 10, 5);
  });
});

describe("canvasToWorldVoxel round-trip", () => {
  for (const plane of PLANES) {
    for (const convention of CONVENTIONS) {
      it(`recovers every voxel center on ${plane}/${convention}`, () => {
        const layout = viewLayout(makeVolume(), plane, convention, CANVAS, NO_TRANSFORM);
        for (let v = 0; v < layout.sizeV; v++) {
          for (let h = 0; h < layout.sizeH; h++) {
            const { canvasX, canvasY } = centerOf(layout, h, v);
            expect(canvasToWorldVoxel({ layout, canvasX, canvasY })).toEqual({
              hWorld: h,
              vWorld: v,
            });
          }
        }
      });
    }
  }

  it("round-trips with zoom and pan applied", () => {
    const layout = viewLayout(makeVolume(), "axial", "neuro", CANVAS, {
      zoom: 2.5,
      panX: 24,
      panY: -18,
    });
    const { canvasX, canvasY } = centerOf(layout, 3, 2);
    expect(canvasToWorldVoxel({ layout, canvasX, canvasY })).toEqual({ hWorld: 3, vWorld: 2 });
  });

  it("round-trips with anisotropic spacing", () => {
    const layout = viewLayout(makeVolume([2, 1, 3]), "coronal", "neuro", CANVAS, NO_TRANSFORM);
    const { canvasX, canvasY } = centerOf(layout, 5, 1);
    expect(canvasToWorldVoxel({ layout, canvasX, canvasY })).toEqual({ hWorld: 5, vWorld: 1 });
  });

  it("returns null outside the slice rectangle", () => {
    const layout = viewLayout(makeVolume(), "axial", "neuro", CANVAS, NO_TRANSFORM);
    expect(canvasToWorldVoxel({ layout, canvasX: 0, canvasY: 0 })).toBeNull();
    expect(
      canvasToWorldVoxel({ layout, canvasX: CANVAS.width, canvasY: CANVAS.height }),
    ).toBeNull();
    expect(
      canvasToWorldVoxel({
        layout,
        canvasX: layout.originX + layout.displayWidth + 1,
        canvasY: layout.originY + layout.displayHeight / 2,
      }),
    ).toBeNull();
  });

  it("mirrors horizontally between neuro and radio on axial", () => {
    const volume = makeVolume();
    const neuro = viewLayout(volume, "axial", "neuro", CANVAS, NO_TRANSFORM);
    const radio = viewLayout(volume, "axial", "radio", CANVAS, NO_TRANSFORM);
    expect(neuro.geom.flipH).toBe(false);
    expect(radio.geom.flipH).toBe(true);

    const probe = {
      canvasX: neuro.originX + neuro.displayWidth * 0.1,
      canvasY: neuro.originY + neuro.displayHeight * 0.5,
    };
    const inNeuro = canvasToWorldVoxel({ layout: neuro, ...probe })!;
    const inRadio = canvasToWorldVoxel({ layout: radio, ...probe })!;
    expect(inNeuro.hWorld).toBe(neuro.sizeH - 1 - inRadio.hWorld);
  });
});
