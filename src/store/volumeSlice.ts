import {
  getCachedVolumeStats,
  makeDerivedVolumeCacheKey,
  type DerivedVolumeCache,
} from "@/lib/imaging/derived";
import { getCachedLut } from "@/lib/render/lutCache";
import type { ColormapName } from "@/lib/render/colormap";

import type {
  Crosshair,
  Layer,
  LayerId,
  LayerRole,
  Volume,
  VolumeStats,
  WindowLevel,
} from "@/store/types";

import {
  buildLayer,
  centerCrosshair,
  clampTimeIndex,
  clampToVolume,
  emptyDocument,
  evictVolumeStats,
  rebuildCompatLayers,
  warmStatsForLayers,
  mutateActiveDisplay,
  mutateLayerDisplay,
} from "@/store/volumeHelpers";
import { selectActiveLayer, selectLayerById } from "@/store/volumeSelectors";

export { selectActiveLayer, selectLayerById, selectLayerStats } from "@/store/volumeSelectors";

export interface VolumeState {
  document: {
    readonly layers: readonly Layer[];
    readonly layerRoles: Readonly<Record<LayerId, LayerRole>>;
  };
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
  setBase: (volume: Volume, stats?: VolumeStats) => void;
  addOverlay: (volume: Volume, stats?: VolumeStats) => void;
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
  getStatsForVolume: (
    volumeId: string,
    timeIndex?: number,
  ) => ReturnType<typeof getCachedVolumeStats>;
  getStatsForLayer: (
    layerId?: LayerId | null,
    timeIndex?: number,
  ) => ReturnType<typeof getCachedVolumeStats>;
  getLayerRole: (layerId: LayerId) => LayerRole | null;
}

export type VolumeSlice = VolumeState & VolumeActions;

type SetFn = (
  partial: Partial<VolumeSlice> | ((state: VolumeSlice) => Partial<VolumeSlice>),
) => void;
type GetFn = () => VolumeSlice;

export function createVolumeSlice(set: SetFn, get: GetFn): VolumeSlice {
  return {
    document: emptyDocument(),
    base: null,
    overlays: [],
    activeLayerId: null,
    cross: { r: 0, a: 0, s: 0, t: 0 },
    crosshairVisible: true,
    derivedCache: { statsByKey: {} },
    statsVersion: 0,

    setBase: (volume, stats) => {
      const state = get();
      const built = buildLayer(volume, "base", state.derivedCache, state.statsVersion, 0, stats);
      const baseKey = makeDerivedVolumeCacheKey(built.layer.id, 0);
      const nextCache: DerivedVolumeCache = {
        statsByKey: {
          [baseKey]: built.derivedCache.statsByKey[baseKey]!,
        },
      };
      const document = {
        layers: [built.layer],
        layerRoles: { [built.layer.id]: "base" as const },
      };
      set({
        document,
        ...rebuildCompatLayers(document),
        activeLayerId: built.layer.id,
        cross: centerCrosshair(volume),
        derivedCache: nextCache,
        statsVersion: built.statsVersion,
      });
    },

    addOverlay: (volume, stats) => {
      const state = get();
      if (state.document.layers.some((l) => l.id === volume.id)) return;
      const built = buildLayer(
        volume,
        "overlay",
        state.derivedCache,
        state.statsVersion,
        state.cross.t,
        stats,
      );
      const document = {
        layers: [...state.document.layers, built.layer],
        layerRoles: {
          ...state.document.layerRoles,
          [built.layer.id]: "overlay" as const,
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
            document: emptyDocument(),
            base: null,
            overlays: [],
            activeLayerId: null,
            cross: { r: 0, a: 0, s: 0, t: 0 },
            derivedCache: { statsByKey: {} },
            statsVersion: state.statsVersion + 1,
          };
        }
        const document = {
          layers: state.document.layers.filter((layer) => layer.id !== layerId),
          layerRoles: Object.fromEntries(
            Object.entries(state.document.layerRoles).filter(([id]) => id !== layerId),
          ) as Readonly<Record<LayerId, LayerRole>>,
        };
        const activeLayerId =
          state.activeLayerId === layerId ? (state.base?.id ?? null) : state.activeLayerId;
        const removed = state.document.layers.find((layer) => layer.id === layerId);
        return {
          document,
          ...rebuildCompatLayers(document),
          activeLayerId,
          ...(removed
            ? {
                derivedCache: evictVolumeStats(state.derivedCache, removed.volume.id),
                statsVersion: state.statsVersion + 1,
              }
            : {}),
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
        document: emptyDocument(),
        base: null,
        overlays: [],
        activeLayerId: null,
        cross: { r: 0, a: 0, s: 0, t: 0 },
        derivedCache: { statsByKey: {} },
        statsVersion: get().statsVersion + 1,
      });
    },

    setCross: (partial) => {
      const state = get();
      const cross = clampToVolume({ ...state.cross, ...partial }, state.base);
      if (
        cross.r === state.cross.r &&
        cross.a === state.cross.a &&
        cross.s === state.cross.s &&
        cross.t === state.cross.t
      ) {
        return;
      }
      if (cross.t === state.cross.t) {
        set({ cross });
        return;
      }
      set({ cross, ...warmStatsForLayers(state, state.document.layers, cross.t) });
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
      const state = get();
      const warmed = warmStatsForLayers(state, state.document.layers, state.cross.t);
      if (warmed.statsVersion !== state.statsVersion) {
        set({
          derivedCache: warmed.derivedCache,
          statsVersion: warmed.statsVersion,
        });
      }
    },

    getStatsForVolume: (volumeId, timeIndex = get().cross.t) =>
      getCachedVolumeStats(get().derivedCache, volumeId, timeIndex),

    getStatsForLayer: (layerId = get().activeLayerId, timeIndex = get().cross.t) => {
      const state = get();
      const layer = selectLayerById(state, layerId) ?? state.base;
      if (!layer) return null;
      return getCachedVolumeStats(
        state.derivedCache,
        layer.volume.id,
        clampTimeIndex(layer.volume, timeIndex),
      );
    },

    getLayerRole: (layerId) => get().document.layerRoles[layerId] ?? null,
  };
}
