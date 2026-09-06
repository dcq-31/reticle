import {
  makeDerivedVolumeCacheKey,
  type DerivedVolumeCache,
  type getCachedVolumeStats,
} from "@/lib/imaging/derived";

import type {
  Layer,
  LayerId,
} from "@/store/types";
import { clampTimeIndex } from "@/store/volumeHelpers";

interface VolumeStateLike {
  readonly activeLayerId: LayerId | null;
  readonly base: Layer | null;
  readonly overlays: readonly Layer[];
  readonly cross: { readonly t: number };
  readonly derivedCache: DerivedVolumeCache;
  readonly document: { readonly layers: readonly Layer[]; readonly layerRoles: Readonly<Record<LayerId, string>> };
}

/**
 * Selector: the layer the W/L sliders + colormap picker are currently editing.
 * Falls back to the base when `activeLayerId` is stale.
 */
export function selectActiveLayer(
  state: Pick<VolumeStateLike, "activeLayerId" | "base" | "overlays">,
): Layer | null {
  if (!state.activeLayerId) return state.base;
  if (state.base?.id === state.activeLayerId) return state.base;
  return state.overlays.find((l) => l.id === state.activeLayerId) ?? state.base;
}

export function selectLayerById(
  state: Pick<VolumeStateLike, "document">,
  layerId: LayerId | null | undefined,
): Layer | null {
  if (!layerId) return null;
  return state.document.layers.find((layer) => layer.id === layerId) ?? null;
}

export function selectLayerStats(
  state: Pick<VolumeStateLike, "cross" | "derivedCache" | "base" | "overlays" | "activeLayerId">,
  layerId?: LayerId | null,
): ReturnType<typeof getCachedVolumeStats> {
  const targetId = layerId ?? state.activeLayerId;
  const layer =
    (targetId
      ? state.base?.id === targetId
        ? state.base
        : state.overlays.find((l) => l.id === targetId)
      : null) ?? state.base;
  if (!layer) return null;
  const key = makeDerivedVolumeCacheKey(
    layer.volume.id,
    clampTimeIndex(layer.volume, state.cross.t),
  );
  return state.derivedCache.statsByKey[key] ?? null;
}
