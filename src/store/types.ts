import type { Convention, Crosshair, Plane } from "@/lib/geometry/planes";
import type { DerivedVolumeCacheKey } from "@/lib/imaging/derived";
import type { Volume } from "@/lib/imaging/types";
import type { ColormapName } from "@/lib/render/colormap";

export type Interp = "sharp" | "smooth";
export type LayoutMode = "grid" | "single" | "volume";
export type LayerId = string;
export type LayerRole = "base" | "overlay";
export type ViewerJobStatus = "idle" | "loading" | "success" | "error" | "stale" | "aborted";

export interface WindowLevel {
  readonly level: number;
  readonly width: number;
}

export interface DisplayProps {
  readonly visible: boolean;
  /** 0..1. Ignored for `base` (always 1). */
  readonly opacity: number;
  readonly cmap: ColormapName;
  readonly invert: boolean;
  readonly win: WindowLevel;
  /** Cached 256x3 LUT (kept in sync with cmap+invert). */
  readonly lut: Uint8Array;
}

export interface ViewerLayer {
  readonly id: LayerId;
  readonly volume: Volume;
  readonly display: DisplayProps;
}

export type Layer = ViewerLayer;

export interface ViewerDocument {
  readonly layers: readonly ViewerLayer[];
  readonly layerRoles: Readonly<Record<LayerId, LayerRole>>;
}

export interface ViewportStateShared {
  readonly cross: Crosshair;
  readonly convention: Convention;
  readonly interp: Interp;
  readonly crosshairVisible: boolean;
}

export type { Plane, Convention, Crosshair, Volume, ColormapName, DerivedVolumeCacheKey };
