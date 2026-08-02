"use client";

import * as Comlink from "comlink";

import type { Volume } from "@/lib/imaging/types";

import type { NiftiWorkerApi } from "@/workers/niftiLoader.worker";

/**
 * Lazily-instantiated singleton Comlink proxy for the NIfTI parsing worker.
 *
 * Spawning once per session keeps the worker warm for subsequent file loads
 * (no module-graph re-parse on the worker side). The proxy is null until
 * the first `parseFileInWorker` call to defer Worker construction past SSR.
 */
let proxy: Comlink.Remote<NiftiWorkerApi> | null = null;

function getProxy(): Comlink.Remote<NiftiWorkerApi> {
  if (proxy) return proxy;
  const worker = new Worker(new URL("./niftiLoader.worker.ts", import.meta.url), {
    type: "module",
    name: "reticle-nifti-loader",
  });
  proxy = Comlink.wrap<NiftiWorkerApi>(worker);
  return proxy;
}

/**
 * Read the file on the main thread (FileReader-equivalent via
 * `File.arrayBuffer()`), then transfer the resulting buffer to the worker
 * where the actual decode + stats happen. The returned Volume comes back
 * with its data + histogram buffers transferred zero-copy.
 */
export async function parseFileInWorker(file: File): Promise<Volume> {
  const buffer = await file.arrayBuffer();
  const remote = getProxy();
  return remote.parseAndPrepare(Comlink.transfer(buffer, [buffer]), file.name);
}
