import type { Convention, Interp, LayoutMode, Plane } from "@/store/types";

export interface LayoutState {
  layout: LayoutMode;
  maxView: Plane | null;
  mobilePlane: Plane;
  convention: Convention;
  interp: Interp;
}

export interface LayoutActions {
  setLayout: (layout: LayoutMode) => void;
  setMaxView: (plane: Plane | null) => void;
  setMobilePlane: (plane: Plane) => void;
  setConvention: (c: Convention) => void;
  setInterp: (i: Interp) => void;
}

export type LayoutSlice = LayoutState & LayoutActions;

type SetFn = (partial: Partial<LayoutSlice>) => void;

export function createLayoutSlice(set: SetFn): LayoutSlice {
  return {
    layout: "grid",
    maxView: null,
    mobilePlane: "axial",
    convention: "neuro",
    interp: "sharp",

    setLayout: (layout) => set({ layout, maxView: null }),
    setMaxView: (maxView) => set({ maxView }),
    setMobilePlane: (mobilePlane) => set({ mobilePlane }),
    setConvention: (convention) => set({ convention }),
    setInterp: (interp) => set({ interp }),
  };
}
