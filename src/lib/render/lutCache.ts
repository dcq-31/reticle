import { buildLUT, type ColormapName } from "@/lib/render/colormap";

const lutCache = new Map<string, Uint8Array>();

export function getCachedLut(name: ColormapName, invert = false): Uint8Array {
  const key = `${name}:${invert ? 1 : 0}`;
  const existing = lutCache.get(key);
  if (existing) return existing;
  const lut = buildLUT(name, invert);
  lutCache.set(key, lut);
  return lut;
}
