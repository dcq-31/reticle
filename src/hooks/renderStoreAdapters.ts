"use client";

import { useMemo } from "react";

import { useViewerStore } from "@/store";

import type { Layer, VolumeMode } from "@/store";
import type { Crosshair, Convention, Interp } from "@/store/types";
import type { VolumeStats } from "@/lib/imaging/types";

export interface SliceRenderSnapshot {
  readonly base: Layer | null;
  readonly overlays: readonly Layer[];
  readonly cross: Crosshair;
  readonly crosshairVisible: boolean;
  readonly convention: Convention;
  readonly interp: Interp;
}

export interface SliceRenderStoreAdapter {
  getSnapshot: () => SliceRenderSnapshot;
  subscribeOffscreen: (onChange: () => void) => () => void;
  subscribeCompositor: (onChange: () => void) => () => void;
}

export interface VolumeRenderSnapshot {
  readonly base: Layer | null;
  readonly stats: VolumeStats | null;
  readonly timeIndex: number;
  readonly mode: VolumeMode;
  readonly threshold: number;
  readonly density: number;
  readonly quality: number;
  readonly shade: boolean;
  readonly resetSeq: number;
}

export interface VolumeChange {
  /** True only for a base-volume swap, not a timepoint or stats change. */
  readonly volumeChanged: boolean;
}

export interface VolumeRenderStoreAdapter {
  getSnapshot: () => VolumeRenderSnapshot;
  subscribeVolume: (onChange: (change: VolumeChange) => void) => () => void;
  subscribeDisplay: (onChange: () => void) => () => void;
  subscribeSettings: (onChange: () => void) => () => void;
  subscribeReset: (onChange: () => void) => () => void;
}

export function useSliceRenderStoreAdapter(sliceKey: "r" | "a" | "s"): SliceRenderStoreAdapter {
  return useMemo(() => createSliceRenderStoreAdapter(sliceKey), [sliceKey]);
}

export function useVolumeRenderStoreAdapter(): VolumeRenderStoreAdapter {
  return useMemo(() => createVolumeRenderStoreAdapter(), []);
}

export function createSliceRenderStoreAdapter(sliceKey: "r" | "a" | "s"): SliceRenderStoreAdapter {
  return {
    getSnapshot: () => {
      const state = useViewerStore.getState();
      return {
        base: state.base,
        overlays: state.overlays,
        cross: state.cross,
        crosshairVisible: state.crosshairVisible,
        convention: state.convention,
        interp: state.interp,
      };
    },
    subscribeOffscreen: (onChange) =>
      useViewerStore.subscribe(
        (state) => ({
          baseId: state.base?.id,
          volume: state.base?.volume,
          win: state.base?.display.win,
          lut: state.base?.display.lut,
          sliceCoord: state.cross[sliceKey],
          t: state.cross.t,
          convention: state.convention,
          overlays: state.overlays,
        }),
        onChange,
        { equalityFn: shallowEq },
      ),
    subscribeCompositor: (onChange) =>
      useViewerStore.subscribe(
        (state) => ({
          cross: state.cross,
          crosshairVisible: state.crosshairVisible,
          interp: state.interp,
        }),
        onChange,
        { equalityFn: shallowEq },
      ),
  };
}

export function createVolumeRenderStoreAdapter(): VolumeRenderStoreAdapter {
  return {
    getSnapshot: () => {
      const state = useViewerStore.getState();
      const base = state.base;
      return {
        base,
        stats: base ? state.getStatsForLayer(base.id, state.cross.t) : null,
        timeIndex: state.cross.t,
        mode: state.mode,
        threshold: state.threshold,
        density: state.density,
        quality: state.quality,
        shade: state.shade,
        resetSeq: state.vol3dResetSeq,
      };
    },
    // One subscription, not two — a base swap moves all three keys at once,
    // so splitting this would rebuild the texture twice.
    subscribeVolume: (onChange) =>
      useViewerStore.subscribe(
        (state) => ({
          volume: state.base?.volume,
          t: state.cross.t,
          statsVersion: state.statsVersion,
        }),
        (next, prev) => onChange({ volumeChanged: next.volume !== prev.volume }),
        { equalityFn: shallowEq },
      ),
    subscribeDisplay: (onChange) =>
      useViewerStore.subscribe((state) => state.base?.display, onChange),
    subscribeSettings: (onChange) =>
      useViewerStore.subscribe(
        (state) => ({
          m: state.mode,
          th: state.threshold,
          de: state.density,
          q: state.quality,
          sh: state.shade,
        }),
        onChange,
        {
          equalityFn: (a, b) =>
            a.m === b.m && a.th === b.th && a.de === b.de && a.q === b.q && a.sh === b.sh,
        },
      ),
    subscribeReset: (onChange) =>
      useViewerStore.subscribe((state) => state.vol3dResetSeq, onChange),
  };
}

function shallowEq<T extends Record<string, unknown>>(a: T, b: T): boolean {
  if (a === b) return true;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}
