import { describe, expect, it } from "vitest";

import { parseNiftiBuffer } from "@/lib/imaging/nifti/adapter";
import { renderSliceToImageData } from "@/lib/render/slice";
import type { Volume } from "@/lib/imaging/types";

import { buildNifti1Buffer } from "../../fixtures/nifti";

function makeVolume(name: string, data: Float32Array, xOffset = 0): Volume {
  return parseNiftiBuffer(
    buildNifti1Buffer({
      nx: 2,
      ny: 2,
      nz: 1,
      datatypeCode: 16,
      data,
      sform: [
        [1, 0, 0, xOffset],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
      ],
    }),
    name,
  );
}

function solidLut(r: number, g: number, b: number): Uint8Array {
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
}

describe("renderSliceToImageData", () => {
  it("does not sample overlay voxels from negative fractional coordinates", () => {
    const base = makeVolume("base.nii", new Float32Array([0, 0, 0, 0]));
    const overlay = makeVolume("overlay.nii", new Float32Array([1, 1, 1, 1]), 0.6);
    const image = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray(2 * 2 * 4),
    } as ImageData;

    renderSliceToImageData(
      {
        volume: base,
        plane: "axial",
        convention: "neuro",
        winLow: 0,
        winWidth: 1,
        lut: solidLut(0, 0, 0),
        slice: 0,
        timeIndex: 0,
        overlays: [
          {
            volume: overlay,
            winLow: 0,
            winWidth: 1,
            lut: solidLut(255, 0, 0),
            opacity: 1,
          },
        ],
      },
      image,
    );

    expect(Array.from(image.data.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(image.data.slice(4, 8))).toEqual([255, 0, 0, 255]);
  });
});
