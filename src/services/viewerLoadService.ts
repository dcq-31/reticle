"use client";

import { loadWithAdapter, resolveAdapter } from "@/lib/imaging/loader";
import type { Volume, VolumeSource, VolumeStats } from "@/lib/imaging/types";
import type { ViewerJobStatus } from "@/store/types";
import { loadVolumesInWorker } from "@/workers/niftiLoader";

export type LoadKind = "base" | "overlay";

export interface LoadedVolume {
  readonly volume: Volume;
  readonly stats?: VolumeStats;
}

export interface LoadRequest {
  readonly file: File;
  readonly kind: LoadKind;
}

export interface LoadResult {
  readonly requestId: number;
  readonly kind: LoadKind;
  readonly sourceFormat: VolumeSource;
  readonly volumes: readonly LoadedVolume[];
  readonly warnings: readonly string[];
  readonly status: ViewerJobStatus;
}

export class ViewerLoadService {
  private requestSeq = 0;
  private activeRequestId = 0;
  private activeController: AbortController | null = null;

  async load(request: LoadRequest): Promise<LoadResult> {
    const requestId = ++this.requestSeq;
    this.activeRequestId = requestId;
    this.activeController?.abort();
    const controller = new AbortController();
    this.activeController = controller;

    try {
      const { adapter } = await resolveAdapter(request.file);
      controller.signal.throwIfAborted?.();
      const loaded =
        adapter.execution === "worker"
          ? await loadVolumesInWorker(request.file, adapter.id, controller.signal)
          : (await loadWithAdapter(request.file, adapter, controller.signal)).map(
              (volume) =>
                ({
                  volume,
                }) as LoadedVolume,
            );

      if (requestId !== this.activeRequestId) {
        return {
          requestId,
          kind: request.kind,
          sourceFormat: adapter.id,
          volumes: [],
          warnings: [],
          status: "stale",
        };
      }

      return {
        requestId,
        kind: request.kind,
        sourceFormat: adapter.id,
        volumes: loaded,
        warnings: [],
        status: "success",
      };
    } catch (error) {
      if (controller.signal.aborted) {
        return {
          requestId,
          kind: request.kind,
          sourceFormat: "nifti",
          volumes: [],
          warnings: [],
          status: requestId === this.activeRequestId ? "aborted" : "stale",
        };
      }
      throw error;
    } finally {
      if (this.activeController === controller) {
        this.activeController = null;
      }
    }
  }
}

let singleton: ViewerLoadService | null = null;

export function getViewerLoadService(): ViewerLoadService {
  if (singleton) return singleton;
  singleton = new ViewerLoadService();
  return singleton;
}
