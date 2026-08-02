type RGB = readonly [number, number, number];

export const CMAP_ANCHORS = {
  gray: [
    [0, 0, 0],
    [255, 255, 255],
  ],
  bone: [
    [0, 0, 0],
    [84, 84, 116],
    [169, 200, 200],
    [255, 255, 255],
  ],
  hot: [
    [0, 0, 0],
    [230, 0, 0],
    [255, 210, 0],
    [255, 255, 255],
  ],
  cool: [
    [0, 255, 255],
    [255, 0, 255],
  ],
  jet: [
    [0, 0, 131],
    [0, 60, 255],
    [0, 255, 255],
    [120, 255, 120],
    [255, 255, 0],
    [255, 60, 0],
    [128, 0, 0],
  ],
  viridis: [
    [68, 1, 84],
    [71, 44, 122],
    [59, 81, 139],
    [44, 113, 142],
    [33, 144, 141],
    [39, 173, 129],
    [92, 200, 99],
    [170, 220, 50],
    [253, 231, 37],
  ],
  plasma: [
    [13, 8, 135],
    [84, 2, 163],
    [139, 10, 165],
    [185, 50, 137],
    [219, 92, 104],
    [244, 136, 73],
    [254, 188, 43],
    [240, 249, 33],
  ],
  magma: [
    [0, 0, 4],
    [40, 11, 84],
    [101, 21, 110],
    [159, 42, 99],
    [212, 72, 66],
    [245, 125, 21],
    [252, 194, 99],
    [252, 253, 191],
  ],
  inferno: [
    [0, 0, 4],
    [51, 16, 75],
    [120, 28, 109],
    [190, 55, 82],
    [236, 121, 35],
    [251, 182, 26],
    [252, 255, 164],
  ],
  red: [
    [12, 0, 0],
    [255, 40, 40],
  ],
  green: [
    [0, 12, 0],
    [40, 255, 80],
  ],
  blue: [
    [0, 0, 12],
    [60, 120, 255],
  ],
} as const satisfies Record<string, readonly RGB[]>;

export type ColormapName = keyof typeof CMAP_ANCHORS;

export const COLORMAP_NAMES = Object.keys(CMAP_ANCHORS) as readonly ColormapName[];

/** LUT size used everywhere (matches 8-bit display precision). */
export const LUT_SIZE = 256;

/**
 * Build a 256-entry RGB lookup table as a packed `Uint8Array(768)`.
 * `invert` reverses the LUT direction (low intensity -> bright).
 *
 * Output layout: `[r0,g0,b0, r1,g1,b1, ..., r255,g255,b255]`.
 */
export function buildLUT(name: ColormapName, invert = false): Uint8Array {
  const anchors = CMAP_ANCHORS[name];
  const lut = new Uint8Array(LUT_SIZE * 3);
  const n = anchors.length - 1;

  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1);
    const f = t * n;
    const idx = Math.min(n - 1, Math.floor(f));
    const frac = f - idx;
    const a = anchors[idx]!;
    const b = anchors[idx + 1]!;
    const r = a[0] + (b[0] - a[0]) * frac;
    const g = a[1] + (b[1] - a[1]) * frac;
    const bl = a[2] + (b[2] - a[2]) * frac;
    const o = invert ? (LUT_SIZE - 1 - i) * 3 : i * 3;
    lut[o] = r | 0;
    lut[o + 1] = g | 0;
    lut[o + 2] = bl | 0;
  }
  return lut;
}
