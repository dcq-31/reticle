import { computeStats } from "@/lib/imaging/nifti/volume";
import { buildLUT, type ColormapName } from "@/lib/render/colormap";

import type { Crosshair, DisplayProps, Layer, Volume, WindowLevel } from "@/store/types";

export interface VolumeState {
  base: Layer | null;
  overlays: readonly Layer[];
  activeLayerId: string | null;
  cross: Crosshair;
  crosshairVisible: boolean;
}

export type WindowPreset = "auto" | "full" | "robust";

export interface VolumeActions {
  setBase: (volume: Volume) => void;
  addOverlay: (volume: Volume) => void;
  removeLayer: (layerId: string) => void;
  setActiveLayer: (layerId: string) => void;
  setLayerVisibility: (layerId: string, visible: boolean) => void;
  setLayerOpacity: (layerId: string, opacity: number) => void;
  clearVolumes: () => void;
  setCross: (partial: Partial<Crosshair>) => void;
  setCrosshairVisible: (visible: boolean) => void;
  setActiveWindow: (win: WindowLevel) => void;
  setActiveCmap: (cmap: ColormapName) => void;
  setActiveInvert: (invert: boolean) => void;
  applyWindowPreset: (preset: WindowPreset) => void;
  /** Re-run computeStats for the base layer at the current time index. */
  refreshStats: () => void;
}

export type VolumeSlice = VolumeState & VolumeActions;

/**
 * Selector: the layer the W/L sliders + colormap picker are currently editing.
 * Falls back to the base when `activeLayerId` is stale.
 */
export function selectActiveLayer(state: VolumeState): Layer | null {
  if (!state.activeLayerId) return state.base;
  if (state.base?.id === state.activeLayerId) return state.base;
  return state.overlays.find((l) => l.id === state.activeLayerId) ?? state.base;
}

function defaultBaseDisplay(volume: Volume): DisplayProps {
  // Auto-window from robust percentiles; falls back to full range if no stats.
  const stats = volume.stats;
  const lo = stats?.p2 ?? 0;
  const hi = stats?.p98 ?? 1;
  return {
    visible: true,
    opacity: 1,
    cmap: "gray",
    invert: false,
    win: { level: (lo + hi) / 2, width: Math.max(1e-6, hi - lo) },
    lut: buildLUT("gray", false),
  };
}

/**
 * Overlay defaults differ from the base: a heat colormap (visually distinct
 * against the typical gray structural) and 70% opacity so the base shows
 * through.
 */
function defaultOverlayDisplay(volume: Volume): DisplayProps {
  const stats = volume.stats;
  const lo = stats?.p2 ?? 0;
  const hi = stats?.p98 ?? 1;
  return {
    visible: true,
    opacity: 0.7,
    cmap: "hot",
    invert: false,
    win: { level: (lo + hi) / 2, width: Math.max(1e-6, hi - lo) },
    lut: buildLUT("hot", false),
  };
}

/**
 * Compute stats BEFORE building the display so the default window/level
 * can read robust percentiles. `volume.stats` is the documented mutable
 * cache slot on the Volume interface.
 */
function makeLayer(volume: Volume, makeDisplay: (volume: Volume) => DisplayProps): Layer {
  const v = volume as Volume & { stats?: ReturnType<typeof computeStats> };
  if (!v.stats) v.stats = computeStats(volume, 0);
  return { id: volume.id, volume, display: makeDisplay(volume) };
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

type SetFn = (
  partial: Partial<VolumeSlice> | ((state: VolumeSlice) => Partial<VolumeSlice>),
) => void;
type GetFn = () => VolumeSlice;

export function createVolumeSlice(set: SetFn, get: GetFn): VolumeSlice {
  return {
    base: null,
    overlays: [],
    activeLayerId: null,
    cross: { r: 0, a: 0, s: 0, t: 0 },
    crosshairVisible: true,

    setBase: (volume) => {
      const layer = makeLayer(volume, defaultBaseDisplay);
      set({
        base: layer,
        overlays: [],
        activeLayerId: layer.id,
        cross: centerCrosshair(volume),
      });
    },

    addOverlay: (volume) => {
      const layer = makeLayer(volume, defaultOverlayDisplay);
      set((state) => ({
        overlays: [...state.overlays, layer],
        // New overlay becomes active so window/colormap controls target it.
        activeLayerId: layer.id,
      }));
    },

    removeLayer: (layerId) => {
      set((state) => {
        if (state.base?.id === layerId) {
          // Removing the base wipes everything.
          return {
            base: null,
            overlays: [],
            activeLayerId: null,
            cross: { r: 0, a: 0, s: 0, t: 0 },
          };
        }
        const overlays = state.overlays.filter((l) => l.id !== layerId);
        const activeLayerId =
          state.activeLayerId === layerId ? (state.base?.id ?? null) : state.activeLayerId;
        return { overlays, activeLayerId };
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
        base: null,
        overlays: [],
        activeLayerId: null,
        cross: { r: 0, a: 0, s: 0, t: 0 },
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
          lut: buildLUT(cmap, d.invert),
        })),
      );
    },

    setActiveInvert: (invert) => {
      set((state) =>
        mutateActiveDisplay(state, (d) => ({
          ...d,
          invert,
          lut: buildLUT(d.cmap, invert),
        })),
      );
    },

    applyWindowPreset: (preset) => {
      const active = selectActiveLayer(get());
      if (!active) return;
      const stats = active.volume.stats;
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
      const { base, cross } = get();
      if (!base) return;
      const fresh = computeStats(base.volume, cross.t);
      // Mutate the cached slot on the volume object; the new Layer reference
      // forces subscribers (slice renderer, histogram) to re-read.
      (base.volume as Volume & { stats?: typeof fresh }).stats = fresh;
      set({ base: { ...base, volume: base.volume } });
    },
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
  layerId: string,
  mut: (d: DisplayProps) => DisplayProps,
): Partial<VolumeSlice> {
  if (state.base && state.base.id === layerId) {
    return { base: { ...state.base, display: mut(state.base.display) } };
  }
  const next = state.overlays.map((l) =>
    l.id === layerId ? { ...l, display: mut(l.display) } : l,
  );
  return { overlays: next };
}
