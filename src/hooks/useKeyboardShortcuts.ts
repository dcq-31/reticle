"use client";

import { useEffect } from "react";

import { keyState } from "@/lib/utils/keyState";
import { useViewerStore } from "@/store";

/**
 * Global keyboard shortcuts:
 *
 *   ↑ / ↓        step one slice in the plane the pointer is over
 *   R            reset views (cross, zoom, pan, auto-window, 3D orbit)
 *   C            toggle crosshair visibility
 *   I            toggle interpolation (sharp ⇄ smooth)
 *   Space        held → pointer drag pans the view
 *
 * Ignores keydowns whose target is an editable element so typing in a
 * numeric input never inadvertently steps a slice.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const isEditable = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      // Must precede the space handler, or typing a space in an input arms pan.
      if (isEditable(e.target)) return;
      if (e.key === " ") {
        keyState.space = true;
        // Don't preventDefault here — buttons still need Space to activate.
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const store = useViewerStore.getState();
      const k = e.key;
      if (k === "ArrowUp" || k === "ArrowDown") {
        e.preventDefault();
        const dir = k === "ArrowUp" ? 1 : -1;
        const plane = store.hover?.plane ?? "axial";
        const c = store.cross;
        store.setCross(
          plane === "axial"
            ? { s: c.s + dir }
            : plane === "coronal"
              ? { a: c.a + dir }
              : { r: c.r + dir },
        );
        return;
      }
      if (k === "r" || k === "R") {
        const base = store.base;
        if (base) {
          const v = base.volume;
          store.setCross({
            r: v.dimsWorld[0] >> 1,
            a: v.dimsWorld[1] >> 1,
            s: v.dimsWorld[2] >> 1,
            t: store.cross.t,
          });
          store.applyWindowPreset("auto");
        }
        store.bumpResetSeq();
        store.resetVolumeView();
        return;
      }
      if (k === "c" || k === "C") {
        store.setCrosshairVisible(!store.crosshairVisible);
        return;
      }
      if (k === "i" || k === "I") {
        store.setInterp(store.interp === "sharp" ? "smooth" : "sharp");
        return;
      }
    };

    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === " ") keyState.space = false;
    };

    const onBlur = (): void => {
      // If the window loses focus while Space is held, the keyup never fires
      // and pan would stay sticky — clear on blur.
      keyState.space = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
