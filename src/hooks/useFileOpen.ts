"use client";

import { useCallback, useMemo } from "react";

import { parseFileInWorker } from "@/workers/niftiLoader";
import { useViewerStore, type Layer } from "@/store";

export type FileOpenKind = "base" | "overlay";

export interface FileOpenHandle {
  /** Load a file and install it as the active base volume (resets overlays). */
  openBase: (file: File) => Promise<void>;
  /** Load a file and append it as a new overlay on top of the current base. */
  openOverlay: (file: File) => Promise<void>;
}

/**
 * Returns stable callbacks that drive the load lifecycle: status updates,
 * toast on completion/error, store update on success.
 *
 * The heavy decode (pako decompression + voxel scan + stats histogram) runs
 * inside a Web Worker via `parseFileInWorker`; the main thread only reads
 * the `File` and updates the store with the worker's result.
 */
export function useFileOpen(): FileOpenHandle {
  const loadWith = useCallback(async (file: File, kind: FileOpenKind): Promise<void> => {
    const store = useViewerStore.getState();
    if (kind === "overlay" && !store.base) {
      store.showToast("Load a base volume first", "error");
      return;
    }
    store.setLoading(true);
    store.setStatus(`Reading ${file.name}…`);
    try {
      const volume = await parseFileInWorker(file);
      if (kind === "base") {
        store.setBase(volume);
        store.setStatus(volumeStatus(volume));
        store.showToast(`Loaded ${volume.name}`);
      } else {
        store.addOverlay(volume);
        store.showToast(`Added overlay ${volume.name}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[useFileOpen] failed:", err);
      store.setStatus("Load failed");
      store.showToast(`Could not load: ${msg}`, "error");
    } finally {
      store.setLoading(false);
    }
  }, []);

  return useMemo<FileOpenHandle>(
    () => ({
      openBase: (file) => loadWith(file, "base"),
      openOverlay: (file) => loadWith(file, "overlay"),
    }),
    [loadWith],
  );
}

function volumeStatus(v: Layer["volume"]): string {
  return (
    `${v.name} · ${v.nx}×${v.ny}×${v.nz}` +
    (v.nt > 1 ? `×${v.nt}` : "") +
    ` · ${v.datatype} · ${v.orientCode}`
  );
}
