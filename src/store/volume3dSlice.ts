export type VolumeMode = "composite" | "mip" | "iso";

export interface Volume3dState {
  /** Render mode: composite DVR, MIP, or iso-surface. */
  mode: VolumeMode;
  /** Iso-surface threshold (for `iso`) or composite cutoff (for `composite`). 0..1. */
  threshold: number;
  /** Composite density multiplier. */
  density: number;
  /** Step-count quality multiplier (0.6 fast, 1 balanced, 1.8 fine). */
  quality: number;
  /** Whether to apply central-difference gradient shading. */
  shade: boolean;
  /** Incremented by `resetVolumeView()` — VolumeView listens to reset its orbit. */
  vol3dResetSeq: number;
}

export interface Volume3dActions {
  setVolumeMode: (mode: VolumeMode) => void;
  setVolumeThreshold: (t: number) => void;
  setVolumeDensity: (d: number) => void;
  setVolumeQuality: (q: number) => void;
  setVolumeShade: (s: boolean) => void;
  resetVolumeView: () => void;
}

export type Volume3dSlice = Volume3dState & Volume3dActions;

type SetFn = (
  partial: Partial<Volume3dSlice> | ((state: Volume3dSlice) => Partial<Volume3dSlice>),
) => void;

export function createVolume3dSlice(set: SetFn): Volume3dSlice {
  return {
    mode: "composite",
    threshold: 0.12,
    density: 1.2,
    quality: 1,
    shade: true,
    vol3dResetSeq: 0,

    setVolumeMode: (mode) => set({ mode }),
    setVolumeThreshold: (threshold) => set({ threshold }),
    setVolumeDensity: (density) => set({ density }),
    setVolumeQuality: (quality) => set({ quality }),
    setVolumeShade: (shade) => set({ shade }),
    resetVolumeView: () => set((state) => ({ vol3dResetSeq: state.vol3dResetSeq + 1 })),
  };
}
