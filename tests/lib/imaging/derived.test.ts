import { describe, expect, it } from "vitest";

import {
  ensureVolumeStats,
  getCachedVolumeStats,
  makeDerivedVolumeCacheKey,
} from "@/lib/imaging/derived";
import { parseNiftiBuffer } from "@/lib/imaging/nifti/adapter";

import { buildNifti1Buffer } from "../../fixtures/nifti";

function makeVolume() {
  const data = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]);
  return parseNiftiBuffer(
    buildNifti1Buffer({
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
    }),
    "derived.nii",
  );
}

describe("derived volume cache", () => {
  it("builds stable cache keys", () => {
    expect(makeDerivedVolumeCacheKey("vol-1", 3)).toBe("vol-1@3");
  });

  it("computes stats once and reuses the cached entry", () => {
    const volume = makeVolume();
    const emptyCache = { statsByKey: {} };

    const first = ensureVolumeStats(emptyCache, volume, 0);
    expect(first.changed).toBe(true);
    expect(first.stats.min).toBe(0);
    expect(first.stats.max).toBe(7);

    const second = ensureVolumeStats(first.cache, volume, 0);
    expect(second.changed).toBe(false);
    expect(second.stats).toBe(first.stats);
    expect(getCachedVolumeStats(second.cache, volume.id, 0)).toBe(first.stats);
  });
});
