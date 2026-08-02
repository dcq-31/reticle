/// <reference lib="webworker" />
import * as Comlink from "comlink";

import { parseNiftiBuffer } from "@/lib/imaging/nifti/adapter";
import { computeStats } from "@/lib/imaging/nifti/volume";
import type { Volume } from "@/lib/imaging/types";

/**
 * NIfTI loader worker — runs gzip decompression, header parsing, voxel
 * unpacking, and statistics scanning off the main thread. Returns a
 * fully-prepared Volume (with `stats` populated) and uses Transferable
 * buffers so the voxel array and histogram move zero-copy.
 *
 * Pure consumer of the same `parseNiftiBuffer` + `computeStats` modules the
 * main thread uses; no DOM or browser-storage access.
 */

export interface NiftiWorkerApi {
  parseAndPrepare(buffer: ArrayBuffer, name: string): Volume;
}

function parseAndPrepare(buffer: ArrayBuffer, name: string): Volume {
  const volume = parseNiftiBuffer(buffer, name);
  // Compute the heavy stats scan here so the main thread receives a Volume
  // that's ready to render without a follow-up O(N) pass.
  volume.stats = computeStats(volume, 0);

  const transferList: ArrayBuffer[] = [];
  pushBufferOnce(transferList, volume.data.buffer as ArrayBuffer);
  pushBufferOnce(transferList, volume.stats.histogram.buffer as ArrayBuffer);
  pushBufferOnce(transferList, volume.affine.buffer as ArrayBuffer);

  return Comlink.transfer(volume, transferList) as Volume;
}

function pushBufferOnce(list: ArrayBuffer[], buf: ArrayBuffer): void {
  if (!list.includes(buf)) list.push(buf);
}

const api: NiftiWorkerApi = { parseAndPrepare };
Comlink.expose(api);
