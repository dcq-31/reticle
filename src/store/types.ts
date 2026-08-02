import type { Plane, Convention } from "@/lib/geometry/planes";
import type { Volume } from "@/lib/imaging/types";
import type { ColormapName } from "@/lib/render/colormap";

export type Interp = "sharp" | "smooth";
export type LayoutMode = "grid" | "single" | "volume";

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

export interface Layer {
  readonly id: string;
  readonly volume: Volume;
  readonly display: DisplayProps;
}

export interface Crosshair {
  readonly r: number;
  readonly a: number;
  readonly s: number;
  readonly t: number;
}

export type { Plane, Convention, Volume, ColormapName };
