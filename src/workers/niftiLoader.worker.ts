/// <reference lib="webworker" />
import * as Comlink from "comlink";

import { parseNiftiBuffer } from "@/lib/imaging/nifti/adapter";
import type { Volume, VolumeSource } from "@/lib/imaging/types";

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
  parseVolumes(buffer: ArrayBuffer, name: string, format: VolumeSource): readonly Volume[];
}

function parseVolumes(buffer: ArrayBuffer, name: string, format: VolumeSource): readonly Volume[] {
  if (format !== "nifti") {
    throw new Error(`Unsupported worker format: ${format}`);
  }
  const volume = parseNiftiBuffer(buffer, name);
  const transferList: ArrayBuffer[] = [];
  pushBufferOnce(transferList, volume.data.buffer as ArrayBuffer);
  pushBufferOnce(transferList, volume.affine.buffer as ArrayBuffer);

  return Comlink.transfer([volume], transferList) as readonly Volume[];
}

function pushBufferOnce(list: ArrayBuffer[], buf: ArrayBuffer): void {
  if (!list.includes(buf)) list.push(buf);
}

const api: VolumeLoaderWorkerApi = { parseVolumes };
Comlink.expose(api);
