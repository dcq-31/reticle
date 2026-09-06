/**
 * Single import point for the viewer store.
 *
 * Usage:
 *   import { useViewerStore, selectActiveLayer } from "@/store/all";
 */

export {
  useViewerStore,
  useActiveLayer,
  useActiveLayerStats,
  useLayerStats,
  type ViewerStore,
} from "@/store/index";

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
