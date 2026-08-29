import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFileOpen } from "@/hooks/useFileOpen";
import { parseNiftiBuffer } from "@/lib/imaging/nifti/adapter";
import type { Volume } from "@/lib/imaging/types";
import type { LoadResult } from "@/services/viewerLoadService";
import { useViewerStore } from "@/store";

import { buildNifti1Buffer } from "../fixtures/nifti";

const mocks = vi.hoisted(() => ({ loadMock: vi.fn() }));

vi.mock("@/services/viewerLoadService", () => ({
  getViewerLoadService: () => ({ load: mocks.loadMock }),
}));

function makeVolume(name: string): Volume {
  const data = new Float32Array(4 * 4 * 4);
  for (let i = 0; i < data.length; i++) data[i] = i;
  return parseNiftiBuffer(
    buildNifti1Buffer({
      nx: 4,
      ny: 4,
      nz: 4,
      datatypeCode: 16,
      data,
      sform: [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
      ],
    }),
    name,
  );
}

function result(volume: Volume | null, over: Partial<LoadResult> = {}): LoadResult {
  return {
    requestId: 1,
    kind: "base",
    sourceFormat: "nifti",
    volumes: volume ? [{ volume }] : [],
    warnings: [],
    status: "success",
    ...over,
  };
}

function open(): ReturnType<typeof useFileOpen> {
  return renderHook(() => useFileOpen()).result.current;
}

const file = (name = "brain.nii"): File => new File([new Uint8Array([1, 2, 3])], name);

beforeEach(() => {
  mocks.loadMock.mockReset();
  // `clearVolumes` only resets the document — the UI slice carries over, so a
  // toast from a previous test would otherwise satisfy the next one's assertion.
  const store = useViewerStore.getState();
  store.clearVolumes();
  store.dismissToast();
  store.setLoading(false);
  store.setStatus("No volume loaded");
  store.setJobStatus("idle");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useFileOpen", () => {
  it("installs a successful base load and reports it", async () => {
    const volume = makeVolume("brain.nii");
    mocks.loadMock.mockResolvedValue(result(volume));

    await open().openBase(file());

    const state = useViewerStore.getState();
    expect(state.base?.volume.id).toBe(volume.id);
    expect(state.jobStatus).toBe("success");
    expect(state.loading).toBe(false);
    expect(state.toast).toMatchObject({ kind: "info", text: "Loaded brain.nii" });
    // Status carries the dims/datatype/orientation summary.
    expect(state.status).toContain("4×4×4");
    expect(state.status).toContain("float32");
  });

  it("appends an overlay on top of an existing base", async () => {
    const base = makeVolume("base.nii");
    useViewerStore.getState().setBase(base);

    const overlay = makeVolume("mask.nii");
    mocks.loadMock.mockResolvedValue(result(overlay, { kind: "overlay" }));

    await open().openOverlay(file("mask.nii"));

    const state = useViewerStore.getState();
    expect(state.base?.volume.id).toBe(base.id);
    expect(state.overlays.map((l) => l.volume.id)).toEqual([overlay.id]);
    expect(state.toast).toMatchObject({ kind: "info", text: "Added overlay mask.nii" });
  });

  it("refuses an overlay when no base is loaded, without touching the service", async () => {
    await open().openOverlay(file("mask.nii"));

    expect(mocks.loadMock).not.toHaveBeenCalled();
    const state = useViewerStore.getState();
    expect(state.toast).toMatchObject({ kind: "error", text: "Load a base volume first" });
    expect(state.overlays).toHaveLength(0);
    expect(state.loading).toBe(false);
  });

  it("leaves the active loading status untouched when a result comes back stale", async () => {
    mocks.loadMock.mockResolvedValue(result(null, { status: "stale" }));

    await open().openBase(file());

    const state = useViewerStore.getState();
    expect(state.jobStatus).toBe("loading");
    // The superseding load owns the spinner — clearing it here would flicker
    // the toolbar back to idle while a newer parse is still running.
    expect(state.loading).toBe(true);
    expect(state.base).toBeNull();
    expect(state.toast).toBeNull();
  });

  it("clears the spinner when the load is aborted", async () => {
    mocks.loadMock.mockResolvedValue(result(null, { status: "aborted" }));

    await open().openBase(file());

    const state = useViewerStore.getState();
    expect(state.jobStatus).toBe("aborted");
    expect(state.loading).toBe(false);
    expect(state.base).toBeNull();
  });

  it("surfaces a parse failure as an error toast and clears the spinner", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.loadMock.mockRejectedValue(new Error("Not a NIfTI file (unrecognized header size)."));

    await open().openBase(file("notes.txt"));

    const state = useViewerStore.getState();
    expect(state.jobStatus).toBe("error");
    expect(state.loading).toBe(false);
    expect(state.status).toBe("Load failed");
    expect(state.toast?.kind).toBe("error");
    expect(state.toast?.text).toContain("unrecognized header size");
  });

  it("treats an empty volume list as a failure rather than installing nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.loadMock.mockResolvedValue(result(null));

    await open().openBase(file());

    const state = useViewerStore.getState();
    expect(state.jobStatus).toBe("error");
    expect(state.base).toBeNull();
    expect(state.toast?.kind).toBe("error");
  });
});
