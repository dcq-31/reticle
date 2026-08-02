import { describe, expect, it } from "vitest";

import { buildLUT, CMAP_ANCHORS, COLORMAP_NAMES, LUT_SIZE } from "@/lib/render/colormap";

describe("buildLUT", () => {
  it("returns a 256x3 byte LUT", () => {
    const lut = buildLUT("gray");
    expect(lut).toBeInstanceOf(Uint8Array);
    expect(lut.length).toBe(LUT_SIZE * 3);
  });

  it("pins endpoints to the first and last anchor", () => {
    const lut = buildLUT("gray");
    const first = CMAP_ANCHORS.gray[0];
    const last = CMAP_ANCHORS.gray[CMAP_ANCHORS.gray.length - 1]!;
    expect(lut[0]).toBe(first[0]);
    expect(lut[1]).toBe(first[1]);
    expect(lut[2]).toBe(first[2]);
    expect(lut[(LUT_SIZE - 1) * 3]).toBe(last[0]);
    expect(lut[(LUT_SIZE - 1) * 3 + 1]).toBe(last[1]);
    expect(lut[(LUT_SIZE - 1) * 3 + 2]).toBe(last[2]);
  });

  it("invert reverses the LUT", () => {
    const lut = buildLUT("gray", false);
    const inv = buildLUT("gray", true);
    expect(inv[0]).toBe(lut[(LUT_SIZE - 1) * 3]);
    expect(inv[(LUT_SIZE - 1) * 3]).toBe(lut[0]);
  });

  it("interpolates monotonically for gray", () => {
    const lut = buildLUT("gray");
    for (let i = 1; i < LUT_SIZE; i++) {
      expect(lut[i * 3]!).toBeGreaterThanOrEqual(lut[(i - 1) * 3]!);
    }
  });

  it("exposes all 12 named colormaps", () => {
    expect(COLORMAP_NAMES.length).toBe(12);
    for (const name of COLORMAP_NAMES) {
      const lut = buildLUT(name);
      expect(lut.length).toBe(LUT_SIZE * 3);
    }
  });
});
