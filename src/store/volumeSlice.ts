import {
  ensureVolumeStats,
  getCachedVolumeStats,
  makeDerivedVolumeCacheKey,
  type DerivedVolumeCache,
} from "@/lib/imaging/derived";
import { getCachedLut } from "@/lib/render/lutCache";
import type { ColormapName } from "@/lib/render/colormap";

import type {
  Crosshair,
  DisplayProps,
  Layer,
  LayerId,
  LayerRole,
  ViewerDocument,
  Volume,
  WindowLevel,
} from "@/store/types";

export interface VolumeState {
  document: ViewerDocument;
  base: Layer | null;
  overlays: readonly Layer[];
  activeLayerId: LayerId | null;
  cross: Crosshair;
  crosshairVisible: boolean;
  derivedCache: DerivedVolumeCache;
  statsVersion: number;
}

export type WindowPreset = "auto" | "full" | "robust";

export interface VolumeActions {
  setBase: (volume: Volume) => void;
  addOverlay: (volume: Volume) => void;
  removeLayer: (layerId: LayerId) => void;
  setActiveLayer: (layerId: LayerId) => void;
  setLayerVisibility: (layerId: LayerId, visible: boolean) => void;
  setLayerOpacity: (layerId: LayerId, opacity: number) => void;
  clearVolumes: () => void;
  setCross: (partial: Partial<Crosshair>) => void;
  setCrosshairVisible: (visible: boolean) => void;
  setActiveWindow: (win: WindowLevel) => void;
  setActiveCmap: (cmap: ColormapName) => void;
  setActiveInvert: (invert: boolean) => void;
  applyWindowPreset: (preset: WindowPreset) => void;
  refreshStats: () => void;
  getStatsForVolume: (volumeId: string, timeIndex?: number) => ReturnType<typeof getCachedVolumeStats>;
  getStatsForLayer: (layerId?: LayerId | null, timeIndex?: number) => ReturnType<typeof getCachedVolumeStats>;
  getLayerRole: (layerId: LayerId) => LayerRole | null;
}

export type VolumeSlice = VolumeState & VolumeActions;

const EMPTY_DOCUMENT: ViewerDocument = {
  layers: [],
  layerRoles: {},
};

function defaultBaseDisplay(stats: NonNullable<ReturnType<typeof getCachedVolumeStats>>): DisplayProps {
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

function defaultOverlayDisplay(
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

function centerCrosshair(volume: Volume): Crosshair {
  return {
    r: volume.dimsWorld[0] >> 1,
    a: volume.dimsWorld[1] >> 1,
    s: volume.dimsWorld[2] >> 1,
    t: 0,
  };
}

const clampToVolume = (cross: Crosshair, base: Layer | null): Crosshair => {
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

function rebuildCompatLayers(document: ViewerDocument): {
  readonly base: Layer | null;
  readonly overlays: readonly Layer[];
} {
  const base = document.layers.find((layer) => document.layerRoles[layer.id] === "base") ?? null;
  return {
    base,
    overlays: document.layers.filter((layer) => document.layerRoles[layer.id] === "overlay"),
  };
}

function ensureStatsForVolumeState(
  state: Pick<VolumeState, "derivedCache" | "statsVersion">,
  volume: Volume,
  timeIndex: number,
): {
  readonly derivedCache: DerivedVolumeCache;
  readonly stats: NonNullable<ReturnType<typeof getCachedVolumeStats>>;
  readonly statsVersion: number;
} {
  const ensured = ensureVolumeStats(state.derivedCache, volume, timeIndex);
  return {
    derivedCache: ensured.cache,
    stats: ensured.stats,
    statsVersion: state.statsVersion + (ensured.changed ? 1 : 0),
  };
}

function buildLayer(
  volume: Volume,
  role: LayerRole,
  derivedCache: DerivedVolumeCache,
  statsVersion: number,
): {
  readonly layer: Layer;
  readonly derivedCache: DerivedVolumeCache;
  readonly statsVersion: number;
} {
  const ensured = ensureStatsForVolumeState({ derivedCache, statsVersion }, volume, 0);
  return {
    layer: {
      id: volume.id,
      volume,
      display: role === "base" ? defaultBaseDisplay(ensured.stats) : defaultOverlayDisplay(ensured.stats),
    },
    derivedCache: ensured.derivedCache,
    statsVersion: ensured.statsVersion,
  };
}

/**
 * Selector: the layer the W/L sliders + colormap picker are currently editing.
 * Falls back to the base when `activeLayerId` is stale.
 */
export function selectActiveLayer(state: Pick<VolumeState, "activeLayerId" | "base" | "overlays">): Layer | null {
  if (!state.activeLayerId) return state.base;
  if (state.base?.id === state.activeLayerId) return state.base;
  return state.overlays.find((l) => l.id === state.activeLayerId) ?? state.base;
}

export function selectLayerById(
  state: Pick<VolumeState, "document">,
  layerId: LayerId | null | undefined,
): Layer | null {
  if (!layerId) return null;
  return state.document.layers.find((layer) => layer.id === layerId) ?? null;
}

type SetFn = (
  partial: Partial<VolumeSlice> | ((state: VolumeSlice) => Partial<VolumeSlice>),
) => void;
type GetFn = () => VolumeSlice;

export function createVolumeSlice(set: SetFn, get: GetFn): VolumeSlice {
  return {
    document: EMPTY_DOCUMENT,
    base: null,
    overlays: [],
    activeLayerId: null,
    cross: { r: 0, a: 0, s: 0, t: 0 },
    crosshairVisible: true,
    derivedCache: { statsByKey: {} },
    statsVersion: 0,

    setBase: (volume) => {
      const built = buildLayer(volume, "base", get().derivedCache, get().statsVersion);
      const document: ViewerDocument = {
        layers: [built.layer],
        layerRoles: { [built.layer.id]: "base" },
      };
      set({
        document,
        ...rebuildCompatLayers(document),
        activeLayerId: built.layer.id,
        cross: centerCrosshair(volume),
        derivedCache: built.derivedCache,
        statsVersion: built.statsVersion,
      });
    },

    addOverlay: (volume) => {
      const state = get();
      const built = buildLayer(volume, "overlay", state.derivedCache, state.statsVersion);
      const document: ViewerDocument = {
        layers: [...state.document.layers, built.layer],
        layerRoles: {
          ...state.document.layerRoles,
          [built.layer.id]: "overlay",
        },
      };
      set({
        document,
        ...rebuildCompatLayers(document),
        activeLayerId: built.layer.id,
        derivedCache: built.derivedCache,
        statsVersion: built.statsVersion,
      });
    },

    removeLayer: (layerId) => {
      set((state) => {
        if (state.base?.id === layerId) {
          return {
            document: EMPTY_DOCUMENT,
            base: null,
            overlays: [],
            activeLayerId: null,
            cross: { r: 0, a: 0, s: 0, t: 0 },
            derivedCache: { statsByKey: {} },
            statsVersion: state.statsVersion + 1,
          };
        }
        const document: ViewerDocument = {
          layers: state.document.layers.filter((layer) => layer.id !== layerId),
          layerRoles: Object.fromEntries(
            Object.entries(state.document.layerRoles).filter(([id]) => id !== layerId),
          ) as ViewerDocument["layerRoles"],
        };
        const activeLayerId =
          state.activeLayerId === layerId ? (state.base?.id ?? null) : state.activeLayerId;
        return {
          document,
          ...rebuildCompatLayers(document),
          activeLayerId,
        };
      });
    },

    setActiveLayer: (layerId) => set({ activeLayerId: layerId }),

    setLayerVisibility: (layerId, visible) => {
      set((state) => mutateLayerDisplay(state, layerId, (d) => ({ ...d, visible })));
    },

    setLayerOpacity: (layerId, opacity) => {
      const o = Math.max(0, Math.min(1, opacity));
      set((state) => mutateLayerDisplay(state, layerId, (d) => ({ ...d, opacity: o })));
    },

    clearVolumes: () => {
      set({
        document: EMPTY_DOCUMENT,
        base: null,
        overlays: [],
        activeLayerId: null,
        cross: { r: 0, a: 0, s: 0, t: 0 },
        derivedCache: { statsByKey: {} },
        statsVersion: get().statsVersion + 1,
      });
    },

    setCross: (partial) => {
      const { base } = get();
      const cross = clampToVolume({ ...get().cross, ...partial }, base);
      set({ cross });
    },

    setCrosshairVisible: (visible) => set({ crosshairVisible: visible }),

    setActiveWindow: (win) => {
      set((state) =>
        mutateActiveDisplay(state, (d) => ({
          ...d,
          win: { level: win.level, width: Math.max(1e-6, win.width) },
        })),
      );
    },

    setActiveCmap: (cmap) => {
      set((state) =>
        mutateActiveDisplay(state, (d) => ({
          ...d,
          cmap,
          lut: getCachedLut(cmap, d.invert),
        })),
      );
    },

    setActiveInvert: (invert) => {
      set((state) =>
        mutateActiveDisplay(state, (d) => ({
          ...d,
          invert,
          lut: getCachedLut(d.cmap, invert),
        })),
      );
    },

    applyWindowPreset: (preset) => {
      const active = selectActiveLayer(get());
      if (!active) return;
      const stats = get().getStatsForLayer(active.id);
      if (!stats) return;
      const next = ((): WindowLevel => {
        if (preset === "full") {
          return {
            level: (stats.min + stats.max) / 2,
            width: Math.max(1e-6, stats.max - stats.min),
          };
        }
        if (preset === "auto") {
          return {
            level: (stats.p2 + stats.p98) / 2,
            width: Math.max(1e-6, stats.p98 - stats.p2),
          };
        }
        const pad = (stats.p98 - stats.p2) * 0.15;
        return {
          level: (stats.p2 + stats.p98) / 2,
          width: Math.max(1e-6, stats.p98 - stats.p2 + pad),
        };
      })();
      get().setActiveWindow(next);
    },

    refreshStats: () => {
      const { base, cross, derivedCache, statsVersion } = get();
      if (!base) return;
      const ensured = ensureStatsForVolumeState({ derivedCache, statsVersion }, base.volume, cross.t);
      if (ensured.statsVersion !== statsVersion) {
        set({
          derivedCache: ensured.derivedCache,
          statsVersion: ensured.statsVersion,
        });
      }
    },

    getStatsForVolume: (volumeId, timeIndex = get().cross.t) =>
      getCachedVolumeStats(get().derivedCache, volumeId, timeIndex),

    getStatsForLayer: (layerId = get().activeLayerId, timeIndex = get().cross.t) => {
      const layer = selectLayerById(get(), layerId) ?? get().base;
      if (!layer) return null;
      const cached = getCachedVolumeStats(get().derivedCache, layer.volume.id, timeIndex);
      if (cached) return cached;
      const ensured = ensureStatsForVolumeState(
        { derivedCache: get().derivedCache, statsVersion: get().statsVersion },
        layer.volume,
        timeIndex,
      );
      set({
        derivedCache: ensured.derivedCache,
        statsVersion: ensured.statsVersion,
      });
      return ensured.stats;
    },

    getLayerRole: (layerId) => get().document.layerRoles[layerId] ?? null,
  };
}

function mutateActiveDisplay(
  state: VolumeSlice,
  mut: (d: DisplayProps) => DisplayProps,
): Partial<VolumeSlice> {
  const id = state.activeLayerId;
  if (!id) return {};
  return mutateLayerDisplay(state, id, mut);
}

function mutateLayerDisplay(
  state: VolumeSlice,
  layerId: LayerId,
  mut: (d: DisplayProps) => DisplayProps,
): Partial<VolumeSlice> {
  const document: ViewerDocument = {
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

export function selectLayerStats(
  state: Pick<VolumeSlice, "statsVersion" | "cross" | "derivedCache" | "base" | "overlays" | "activeLayerId">,
  layerId?: LayerId | null,
) {
  void state.statsVersion;
  const targetId = layerId ?? state.activeLayerId;
  const layer =
    (targetId ? (state.base?.id === targetId ? state.base : state.overlays.find((l) => l.id === targetId)) : null) ??
    state.base;
  if (!layer) return null;
  return state.derivedCache.statsByKey[makeDerivedVolumeCacheKey(layer.volume.id, state.cross.t)] ?? null;
}
