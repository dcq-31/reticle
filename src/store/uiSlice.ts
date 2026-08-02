import type { Plane } from "@/store/types";

export type ToastKind = "info" | "error";

export interface ToastMessage {
  readonly id: number;
  readonly text: string;
  readonly kind: ToastKind;
}

export interface HoverState {
  /** Which plane the pointer is currently over. */
  readonly plane: Plane;
  /** World voxel indices the pointer is over (NOT a click — just a hover). */
  readonly r: number;
  readonly a: number;
  readonly s: number;
}

export interface UiState {
  /** When non-null, render hover-driven probe in the status bar instead of cross-driven. */
  hover: HoverState | null;
  /** Latest toast; null after dismissal. */
  toast: ToastMessage | null;
  /** True while a NIfTI is being decoded; toolbar/status reflect this. */
  loading: boolean;
  /** Free-form status string for the toolbar. */
  status: string;
  /** True while a drag operation is over the window. */
  dragActive: boolean;
  /**
   * Incremented by `resetViews()`. SliceView subscribes and uses the change
   * as a signal to reset its per-viewport zoom/pan refs.
   */
  resetSeq: number;
}

export interface UiActions {
  setHover: (h: HoverState | null) => void;
  showToast: (text: string, kind?: ToastKind) => void;
  dismissToast: () => void;
  setLoading: (loading: boolean) => void;
  setStatus: (status: string) => void;
  setDragActive: (active: boolean) => void;
  /** Bump resetSeq — viewports listen to this to clear their zoom/pan. */
  bumpResetSeq: () => void;
}

export type UiSlice = UiState & UiActions;

type SetFn = (partial: Partial<UiSlice> | ((state: UiSlice) => Partial<UiSlice>)) => void;

let toastSeq = 1;

export function createUiSlice(set: SetFn): UiSlice {
  return {
    hover: null,
    toast: null,
    loading: false,
    status: "No volume loaded",
    dragActive: false,
    resetSeq: 0,

    setHover: (hover) => set({ hover }),
    showToast: (text, kind = "info") => set({ toast: { id: toastSeq++, text, kind } }),
    dismissToast: () => set({ toast: null }),
    setLoading: (loading) => set({ loading }),
    setStatus: (status) => set({ status }),
    setDragActive: (dragActive) => set({ dragActive }),
    bumpResetSeq: () => set((state) => ({ resetSeq: state.resetSeq + 1 })),
  };
}
