import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

import { createLayoutSlice, type LayoutSlice } from "@/store/layoutSlice";
import { createUiSlice, type UiSlice } from "@/store/uiSlice";
import { createVolume3dSlice, type Volume3dSlice } from "@/store/volume3dSlice";
import {
  createVolumeSlice,
  selectActiveLayer,
  selectLayerStats,
  type VolumeSlice,
} from "@/store/volumeSlice";
import type { Layer, LayerId } from "@/store/types";

export type ViewerStore = VolumeSlice & LayoutSlice & UiSlice & Volume3dSlice;

export const useViewerStore = create<ViewerStore>()(
  subscribeWithSelector((set, get) => ({
    ...createVolumeSlice(set, get),
    ...createLayoutSlice(set),
    ...createUiSlice(set),
    ...createVolume3dSlice(set),
  })),
);

export {
  type Layer,
  type LayerId,
  type LayerRole,
  type DisplayProps,
  type WindowLevel,
  type ViewerDocument,
  type ViewerLayer,
  type ViewportStateShared,
} from "@/store/types";
export { type ToastKind, type ToastMessage, type HoverState } from "@/store/uiSlice";
export { type VolumeMode } from "@/store/volume3dSlice";

/** Subscribe to the layer currently driving the intensity/colormap controls. */
export function useActiveLayer(): Layer | null {
  return useViewerStore(selectActiveLayer);
}

export function useActiveLayerStats() {
  return useViewerStore((state) => selectLayerStats(state));
}

export function useLayerStats(layerId: LayerId | null) {
  return useViewerStore((state) => selectLayerStats(state, layerId));
}
