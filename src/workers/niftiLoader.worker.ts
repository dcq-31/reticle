/// <reference lib="webworker" />
import * as Comlink from "comlink";

import { parseNiftiBuffer } from "@/lib/imaging/nifti/adapter";
import { computeStats } from "@/lib/imaging/nifti/volume";
import type { Volume, VolumeSource, VolumeStats } from "@/lib/imaging/types";

/**
 * NIfTI loader worker — runs gzip decompression, header parsing, voxel
 * unpacking, and statistics scanning off the main thread. Returns a
 * fully-prepared Volume (with `stats` populated) and uses Transferable
 * buffers so the voxel array and histogram move zero-copy.
 *
 * Pure consumer of the same `parseNiftiBuffer` + `computeStats` modules the
 * main thread uses; no DOM or browser-storage access.
 */

export interface VolumeLoaderWorkerApi {
  parseVolumes(
    buffer: ArrayBuffer,
    name: string,
    format: VolumeSource,
  ): readonly LoadedVolume[];
}

export interface LoadedVolume {
  readonly volume: Volume;
  readonly stats: VolumeStats;
}

function parseVolumes(
  buffer: ArrayBuffer,
  name: string,
  format: VolumeSource,
): readonly LoadedVolume[] {
  if (format !== "nifti") {
    throw new Error(`Unsupported worker format: ${format}`);
  }
  const volume = parseNiftiBuffer(buffer, name);
  const stats = computeStats(volume, 0);
  const transferList: ArrayBuffer[] = [];
  pushBufferOnce(transferList, volume.data.buffer as ArrayBuffer);
  pushBufferOnce(transferList, volume.affine.buffer as ArrayBuffer);
  pushBufferOnce(transferList, stats.histogram.buffer as ArrayBuffer);

  return Comlink.transfer([{ volume, stats }], transferList) as readonly LoadedVolume[];
}

function pushBufferOnce(list: ArrayBuffer[], buf: ArrayBuffer): void {
  if (!list.includes(buf)) list.push(buf);
}

const api: VolumeLoaderWorkerApi = { parseVolumes };
Comlink.expose(api);
