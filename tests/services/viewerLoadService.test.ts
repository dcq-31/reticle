import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FormatAdapter, Volume } from "@/lib/imaging/types";
import { ViewerLoadService } from "@/services/viewerLoadService";

const mocks = vi.hoisted(() => ({
  resolveAdapterMock: vi.fn(),
  loadWithAdapterMock: vi.fn(),
  loadVolumesInWorkerMock: vi.fn(),
}));

vi.mock("@/lib/imaging/loader", () => ({
  resolveAdapter: mocks.resolveAdapterMock,
  loadWithAdapter: mocks.loadWithAdapterMock,
}));

vi.mock("@/workers/niftiLoader", () => ({
  loadVolumesInWorker: mocks.loadVolumesInWorkerMock,
}));

function makeVolume(id: string): Volume {
  return {
    id,
    name: `${id}.nii`,
    source: "nifti",
    nx: 1,
    ny: 1,
    nz: 1,
    nt: 1,
    dimsVox: [1, 1, 1],
    dimsWorld: [1, 1, 1],
    spacing: [1, 1, 1],
    perm: [0, 1, 2],
    sgn: [1, 1, 1],
    affine: new Float32Array(16),
    orientCode: "RAS",
    datatype: "float32",
    data: new Float32Array([1]),
    strides: [1, 1, 1, 1],
    sclSlope: 1,
    sclInter: 0,
  };
}

// `resolve!` is required: TS does not track assignment inside the executor
// and would narrow the binding to `never` at the call site.
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("ViewerLoadService", () => {
  const adapter: FormatAdapter = {
    id: "nifti",
    execution: "worker",
    canLoad: () => true,
    load: vi.fn(),
  };

  beforeEach(() => {
    mocks.resolveAdapterMock.mockReset();
    mocks.loadWithAdapterMock.mockReset();
    mocks.loadVolumesInWorkerMock.mockReset();
  });

  it("routes worker-backed adapters through the worker path", async () => {
    mocks.resolveAdapterMock.mockResolvedValue({ adapter, head: new Uint8Array([1, 2, 3]) });
    mocks.loadVolumesInWorkerMock.mockResolvedValue([makeVolume("vol-worker")]);

    const service = new ViewerLoadService();
    const file = new File([new Uint8Array([1, 2, 3])], "brain.nii");
    const result = await service.load({ file, kind: "base" });

    expect(mocks.loadVolumesInWorkerMock).toHaveBeenCalledOnce();
    expect(mocks.loadWithAdapterMock).not.toHaveBeenCalled();
    expect(result.status).toBe("success");
    expect(result.sourceFormat).toBe("nifti");
    expect(result.volumes[0]?.volume.id).toBe("vol-worker");
  });

  it("reuses the resolved adapter for main-thread adapters", async () => {
    const inlineAdapter: FormatAdapter = {
      ...adapter,
      execution: "main",
    };
    const file = new File([new Uint8Array([1, 2, 3])], "brain.nii");
    mocks.resolveAdapterMock.mockResolvedValue({
      adapter: inlineAdapter,
      head: new Uint8Array([1]),
    });
    mocks.loadWithAdapterMock.mockResolvedValue([makeVolume("vol-main")]);

    const service = new ViewerLoadService();
    const result = await service.load({ file, kind: "base" });

    expect(mocks.resolveAdapterMock).toHaveBeenCalledOnce();
    expect(mocks.loadWithAdapterMock).toHaveBeenCalledOnce();
    expect(mocks.loadWithAdapterMock).toHaveBeenCalledWith(file, inlineAdapter, expect.any(Object));
    expect(result.status).toBe("success");
    expect(result.volumes[0]?.volume.id).toBe("vol-main");
  });

  it("marks older results as stale when a newer request wins", async () => {
    mocks.resolveAdapterMock.mockResolvedValue({ adapter, head: new Uint8Array([1, 2, 3]) });

    const first = deferred<readonly Volume[]>();
    mocks.loadVolumesInWorkerMock
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce([makeVolume("vol-latest")]);

    const service = new ViewerLoadService();
    const firstPromise = service.load({
      file: new File([new Uint8Array([1])], "first.nii"),
      kind: "base",
    });
    await Promise.resolve();
    const secondPromise = service.load({
      file: new File([new Uint8Array([2])], "second.nii"),
      kind: "base",
    });

    first.resolve([makeVolume("vol-stale")]);

    const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise]);
    expect(firstResult.status).toBe("stale");
    expect(firstResult.volumes).toHaveLength(0);
    expect(secondResult.status).toBe("success");
    expect(secondResult.volumes[0]?.volume.id).toBe("vol-latest");
  });
});
