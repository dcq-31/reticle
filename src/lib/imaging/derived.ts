import { computeStats } from "@/lib/imaging/nifti/volume";
import type { Volume, VolumeStats } from "@/lib/imaging/types";

export type DerivedVolumeCacheKey = `${string}@${number}`;

export interface DerivedVolumeCache {
  readonly statsByKey: Readonly<Record<DerivedVolumeCacheKey, VolumeStats>>;
}

export function makeDerivedVolumeCacheKey(volumeId: string, timeIndex: number): DerivedVolumeCacheKey {
  return `${volumeId}@${timeIndex}`;
}

export function getCachedVolumeStats(
  cache: DerivedVolumeCache,
  volumeId: string,
  timeIndex: number,
): VolumeStats | null {
  return cache.statsByKey[makeDerivedVolumeCacheKey(volumeId, timeIndex)] ?? null;
}

export function ensureVolumeStats(
  cache: DerivedVolumeCache,
  volume: Volume,
  timeIndex: number,
): { readonly cache: DerivedVolumeCache; readonly stats: VolumeStats; readonly changed: boolean } {
  const key = makeDerivedVolumeCacheKey(volume.id, timeIndex);
  const existing = cache.statsByKey[key];
  if (existing) {
    return { cache, stats: existing, changed: false };
  }
  const stats = computeStats(volume, timeIndex);
  return {
    cache: {
      statsByKey: {
        ...cache.statsByKey,
        [key]: stats,
      },
    },
    stats,
    changed: true,
  };
}
