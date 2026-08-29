"use client";

import { useCallback, useMemo } from "react";

import { getViewerLoadService } from "@/services/viewerLoadService";
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
    store.setJobStatus("loading");
    store.setStatus(`Reading ${file.name}…`);
    // A superseded load must not clear the spinner — the newer load owns it.
    let superseded = false;
    try {
      const result = await getViewerLoadService().load({ file, kind });
      if (result.status === "stale") {
        superseded = true;
        return;
      }
      if (result.status === "aborted") {
        store.setJobStatus(result.status);
        return;
      }
      const volume = result.volumes[0]?.volume;
      if (!volume) {
        throw new Error(`No volume returned for ${file.name}`);
      }
      if (result.kind === "base") {
        store.setBase(volume);
        store.setStatus(volumeStatus(volume));
        store.showToast(`Loaded ${volume.name}`);
      } else {
        store.addOverlay(volume);
        const base = useViewerStore.getState().base;
        store.setStatus(volumeStatus(base?.volume ?? volume));
        store.showToast(`Added overlay ${volume.name}`);
      }
      store.setJobStatus("success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[useFileOpen] failed:", err);
      store.setStatus("Load failed");
      store.showToast(`Could not load: ${msg}`, "error");
      store.setJobStatus("error");
    } finally {
      if (!superseded) store.setLoading(false);
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
