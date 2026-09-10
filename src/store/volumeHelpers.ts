import {
  ensureVolumeStats,
  makeDerivedVolumeCacheKey,
  type DerivedVolumeCache,
  type getCachedVolumeStats,
} from "@/lib/imaging/derived";
import { getCachedLut } from "@/lib/render/lutCache";

import type { Crosshair, DisplayProps, Layer, LayerId, LayerRole, Volume, VolumeStats } from "@/store/types";

export interface VolumeState {
  derivedCache: DerivedVolumeCache;
  statsVersion: number;
}

export function emptyDocument(): {
  readonly layers: readonly Layer[];
  readonly layerRoles: Readonly<Record<LayerId, LayerRole>>;
} {
  return { layers: [], layerRoles: {} };
}

export function defaultBaseDisplay(
  stats: NonNullable<ReturnType<typeof getCachedVolumeStats>>,
): DisplayProps {
  const lo = stats.p2;
  const hi = stats.p98;
  return {
    visible: true,
    opacity: 1,
    cmap: "gray",
    invert: false,
    win: { level: (lo + hi) / 2, width: Math.max(1e-6, hi - lo) },
    lut: getCachedLut("gray", false),
  };
}

export function defaultOverlayDisplay(
  stats: NonNullable<ReturnType<typeof getCachedVolumeStats>>,
): DisplayProps {
  const lo = stats.p2;
  const hi = stats.p98;
  return {
    visible: true,
    opacity: 0.7,
    cmap: "hot",
    invert: false,
    win: { level: (lo + hi) / 2, width: Math.max(1e-6, hi - lo) },
    lut: getCachedLut("hot", false),
  };
}

export function centerCrosshair(volume: Volume): Crosshair {
  return {
    r: volume.dimsWorld[0] >> 1,
    a: volume.dimsWorld[1] >> 1,
    s: volume.dimsWorld[2] >> 1,
    t: 0,
  };
}

export const clampToVolume = (cross: Crosshair, base: Layer | null): Crosshair => {
  if (!base) return cross;
  const v = base.volume;
  const c = (x: number, hi: number): number => (x < 0 ? 0 : x > hi - 1 ? hi - 1 : x);
  return {
    r: c(cross.r, v.dimsWorld[0]),
    a: c(cross.a, v.dimsWorld[1]),
    s: c(cross.s, v.dimsWorld[2]),
    t: c(cross.t, Math.max(1, v.nt)),
  };
};

export function rebuildCompatLayers(document: {
  readonly layers: readonly Layer[];
  readonly layerRoles: Readonly<Record<LayerId, LayerRole>>;
}): {
  readonly base: Layer | null;
  readonly overlays: readonly Layer[];
} {
  const base = document.layers.find((layer) => document.layerRoles[layer.id] === "base") ?? null;
  return {
    base,
    overlays: document.layers.filter((layer) => document.layerRoles[layer.id] === "overlay"),
  };
}

/** Reads and warms must clamp identically, or their cache keys diverge. */
export function clampTimeIndex(volume: Volume, timeIndex: number): number {
  const last = Math.max(1, volume.nt) - 1;
  return timeIndex < 0 ? 0 : timeIndex > last ? last : timeIndex;
}

export function ensureStatsForVolumeState(
  state: Pick<VolumeState, "derivedCache" | "statsVersion">,
  volume: Volume,
  timeIndex: number,
): {
  readonly derivedCache: DerivedVolumeCache;
  readonly stats: NonNullable<ReturnType<typeof getCachedVolumeStats>>;
  readonly statsVersion: number;
} {
  const ensured = ensureVolumeStats(state.derivedCache, volume, clampTimeIndex(volume, timeIndex));
  return {
    derivedCache: ensured.cache,
    stats: ensured.stats,
    statsVersion: state.statsVersion + (ensured.changed ? 1 : 0),
  };
}

function ensurePrecomputedStats(
  cache: DerivedVolumeCache,
  volume: Volume,
  timeIndex: number,
  stats: VolumeStats,
): DerivedVolumeCache {
  const key = makeDerivedVolumeCacheKey(volume.id, clampTimeIndex(volume, timeIndex));
  if (cache.statsByKey[key]) return cache;
  return {
    statsByKey: {
      ...cache.statsByKey,
      [key]: stats,
    },
  };
}

export function warmStatsForLayers(
  state: Pick<VolumeState, "derivedCache" | "statsVersion">,
  layers: readonly Layer[],
  timeIndex: number,
): { readonly derivedCache: DerivedVolumeCache; readonly statsVersion: number } {
  let derivedCache = state.derivedCache;
  let statsVersion = state.statsVersion;
  for (const layer of layers) {
    const ensured = ensureStatsForVolumeState(
      { derivedCache, statsVersion },
      layer.volume,
      timeIndex,
    );
    derivedCache = ensured.derivedCache;
    statsVersion = ensured.statsVersion;
  }
  return { derivedCache, statsVersion };
}

export function evictVolumeStats(cache: DerivedVolumeCache, volumeId: string): DerivedVolumeCache {
  const prefix = `${volumeId}@`;
  const statsByKey = Object.fromEntries(
    Object.entries(cache.statsByKey).filter(([key]) => !key.startsWith(prefix)),
  ) as DerivedVolumeCache["statsByKey"];
  return { statsByKey };
}

export function buildLayer(
  volume: Volume,
  role: LayerRole,
  derivedCache: DerivedVolumeCache,
  statsVersion: number,
  timeIndex: number,
  precomputedStats?: VolumeStats,
): {
  readonly layer: Layer;
  readonly derivedCache: DerivedVolumeCache;
  readonly statsVersion: number;
} {
  let ensured: { derivedCache: DerivedVolumeCache; stats: VolumeStats; statsVersion: number };
  if (precomputedStats) {
    const cache = ensurePrecomputedStats(derivedCache, volume, timeIndex, precomputedStats);
    ensured = {
      derivedCache: cache,
      stats: precomputedStats,
      statsVersion: statsVersion + (cache !== derivedCache ? 1 : 0),
    };
  } else {
    ensured = ensureStatsForVolumeState({ derivedCache, statsVersion }, volume, timeIndex);
  }
  return {
    layer: {
      id: volume.id,
      volume,
      display:
        role === "base" ? defaultBaseDisplay(ensured.stats) : defaultOverlayDisplay(ensured.stats),
    },
    derivedCache: ensured.derivedCache,
    statsVersion: ensured.statsVersion,
  };
}

export function mutateActiveDisplay(
  state: {
    activeLayerId: LayerId | null;
    document: {
      readonly layers: readonly Layer[];
      readonly layerRoles: Readonly<Record<LayerId, LayerRole>>;
    };
  },
  mut: (d: DisplayProps) => DisplayProps,
): { document: typeof state.document; base: Layer | null; overlays: readonly Layer[] } {
  const id = state.activeLayerId;
  if (!id) return { document: state.document, base: null, overlays: [] };
  return mutateLayerDisplay(state, id, mut);
}

export function mutateLayerDisplay(
  state: {
    document: {
      readonly layers: readonly Layer[];
      readonly layerRoles: Readonly<Record<LayerId, LayerRole>>;
    };
  },
  layerId: LayerId,
  mut: (d: DisplayProps) => DisplayProps,
): { document: typeof state.document; base: Layer | null; overlays: readonly Layer[] } {
  const document = {
    layers: state.document.layers.map((layer) =>
      layer.id === layerId ? { ...layer, display: mut(layer.display) } : layer,
    ),
    layerRoles: state.document.layerRoles,
  };
  return {
    document,
    ...rebuildCompatLayers(document),
  };
}
