"use client";

import { getViewerLoadService, type LoadedVolume } from "@/services/viewerLoadService";
import type { Volume } from "@/lib/imaging/types";

/** Bundled MNI152 sample served from `public/` (see `public/mni152.nii.gz`). */
export const SAMPLE_BRAIN_URL = "/mni152.nii.gz";
export const SAMPLE_BRAIN_NAME = "mni152.nii.gz";

/**
 * Fetch the bundled MNI152 sample and decode it through the standard
 * worker-backed load path, so the default brain behaves exactly like a
 * user-opened file. Throws on fetch/parse failure — callers fall back to
 * the synthetic phantom from `@/lib/imaging/nifti/demo`.
 */
export async function loadSampleBrain(signal?: AbortSignal): Promise<LoadedVolume> {
  const res = await fetch(SAMPLE_BRAIN_URL, signal ? { signal } : undefined);
  if (!res.ok) {
    throw new Error(`Sample brain request failed: ${res.status} ${res.statusText}`);
  }
  const blob = await res.blob();
  const file = new File([blob], SAMPLE_BRAIN_NAME, { type: "application/gzip" });
  const result = await getViewerLoadService().load({ file, kind: "base" });
  const loaded = result.volumes[0];
  if (!loaded) {
    throw new Error(`No volume returned for ${SAMPLE_BRAIN_NAME}`);
  }
  return loaded;
}

/** Status-bar line for a loaded volume (mirrors `useFileOpen` formatting). */
export function sampleStatus(volume: Volume): string {
  return (
    `${volume.name} · ${volume.nx}×${volume.ny}×${volume.nz}` +
    (volume.nt > 1 ? `×${volume.nt}` : "") +
    ` · ${volume.datatype} · ${volume.orientCode}`
  );
}
