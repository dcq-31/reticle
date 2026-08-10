"use client";

import * as Comlink from "comlink";

import type { Volume, VolumeSource } from "@/lib/imaging/types";

import type { VolumeLoaderWorkerApi } from "@/workers/niftiLoader.worker";

/**
 * Lazily-instantiated singleton Comlink proxy for the NIfTI parsing worker.
 *
 * Spawning once per session keeps the worker warm for subsequent file loads
 * (no module-graph re-parse on the worker side). The proxy is null until
 * the first `parseFileInWorker` call to defer Worker construction past SSR.
 */
let proxy: Comlink.Remote<VolumeLoaderWorkerApi> | null = null;

function getProxy(): Comlink.Remote<VolumeLoaderWorkerApi> {
  if (proxy) return proxy;
  const worker = new Worker(new URL("./niftiLoader.worker.ts", import.meta.url), {
    type: "module",
    name: "reticle-volume-loader",
  });
  proxy = Comlink.wrap<VolumeLoaderWorkerApi>(worker);
  return proxy;
}

/**
 * Read the file on the main thread (FileReader-equivalent via
 * `File.arrayBuffer()`), then transfer the resulting buffer to the worker
 * where the actual decode + stats happen. The returned Volume comes back
 * with its data + histogram buffers transferred zero-copy.
 */
export async function loadVolumesInWorker(
  file: File,
  format: VolumeSource,
  signal?: AbortSignal,
): Promise<readonly Volume[]> {
  signal?.throwIfAborted?.();
  const buffer = await file.arrayBuffer();
  signal?.throwIfAborted?.();
  const remote = getProxy();
  return remote.parseVolumes(Comlink.transfer(buffer, [buffer]), file.name, format);
}
