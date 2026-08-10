import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FormatAdapter, Volume } from "@/lib/imaging/types";
import { ViewerLoadService } from "@/services/viewerLoadService";

const mocks = vi.hoisted(() => ({
  resolveAdapterMock: vi.fn(),
  loadFileMock: vi.fn(),
  loadVolumesInWorkerMock: vi.fn(),
}));

vi.mock("@/lib/imaging/loader", () => ({
  resolveAdapter: mocks.resolveAdapterMock,
  loadFile: mocks.loadFileMock,
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

describe("ViewerLoadService", () => {
  const adapter: FormatAdapter = {
    id: "nifti",
    execution: "worker",
    canLoad: () => true,
    load: vi.fn(),
  };

  beforeEach(() => {
    mocks.resolveAdapterMock.mockReset();
    mocks.loadFileMock.mockReset();
    mocks.loadVolumesInWorkerMock.mockReset();
  });

  it("routes worker-backed adapters through the worker path", async () => {
    mocks.resolveAdapterMock.mockResolvedValue({ adapter, head: new Uint8Array([1, 2, 3]) });
    mocks.loadVolumesInWorkerMock.mockResolvedValue([makeVolume("vol-worker")]);

    const service = new ViewerLoadService();
    const file = new File([new Uint8Array([1, 2, 3])], "brain.nii");
    const result = await service.load({ file, kind: "base" });

    expect(mocks.loadVolumesInWorkerMock).toHaveBeenCalledOnce();
    expect(mocks.loadFileMock).not.toHaveBeenCalled();
    expect(result.status).toBe("success");
    expect(result.sourceFormat).toBe("nifti");
    expect(result.volumes[0]?.volume.id).toBe("vol-worker");
  });

  it("marks older results as stale when a newer request wins", async () => {
    mocks.resolveAdapterMock.mockResolvedValue({ adapter, head: new Uint8Array([1, 2, 3]) });

    let resolveFirst: ((volumes: readonly Volume[]) => void) | null = null;
    mocks.loadVolumesInWorkerMock
      .mockImplementationOnce(
        () =>
          new Promise<readonly Volume[]>((resolve) => {
            resolveFirst = resolve;
          }),
      )
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

    expect(resolveFirst).not.toBeNull();
    resolveFirst?.([makeVolume("vol-stale")]);

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.status).toBe("stale");
    expect(first.volumes).toHaveLength(0);
    expect(second.status).toBe("success");
    expect(second.volumes[0]?.volume.id).toBe("vol-latest");
  });
});
