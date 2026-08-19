import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSliceRenderStoreAdapter,
  createVolumeRenderStoreAdapter,
  type VolumeChange,
} from "@/hooks/renderStoreAdapters";
import { parseNiftiBuffer } from "@/lib/imaging/nifti/adapter";
import type { Volume } from "@/lib/imaging/types";
import { useViewerStore } from "@/store";

import { buildNifti1Buffer } from "../fixtures/nifti";

function makeVolume(name: string, nt = 1): Volume {
  const nx = 4;
  const ny = 4;
  const nz = 4;
  const data = new Float32Array(nx * ny * nz * nt);
  for (let i = 0; i < data.length; i++) data[i] = i % (nx * ny * nz);
  return parseNiftiBuffer(
    buildNifti1Buffer({
      nx,
      ny,
      nz,
      nt,
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

const unsubscribes: Array<() => void> = [];

function track(unsub: () => void): void {
  unsubscribes.push(unsub);
}

beforeEach(() => {
  useViewerStore.getState().clearVolumes();
});

afterEach(() => {
  while (unsubscribes.length) unsubscribes.pop()?.();
});

describe("volume render adapter — subscribeVolume", () => {
  it("reports volumeChanged: false when only the timepoint moves", () => {
    const adapter = createVolumeRenderStoreAdapter();
    useViewerStore.getState().setBase(makeVolume("base4d.nii", 4));

    const changes: VolumeChange[] = [];
    track(adapter.subscribeVolume((c) => changes.push(c)));

    useViewerStore.getState().setCross({ t: 1 });

    expect(changes).toEqual([{ volumeChanged: false }]);
  });

  it("reports volumeChanged: true when the base volume is swapped", () => {
    const adapter = createVolumeRenderStoreAdapter();
    useViewerStore.getState().setBase(makeVolume("first.nii"));

    const changes: VolumeChange[] = [];
    track(adapter.subscribeVolume((c) => changes.push(c)));

    useViewerStore.getState().setBase(makeVolume("second.nii"));

    expect(changes).toEqual([{ volumeChanged: true }]);
  });

  it("fires exactly once per timepoint step", () => {
    // Regression: reading stats used to mutate the store mid-notification,
    // re-firing this subscription and rebuilding the 3D texture twice.
    const adapter = createVolumeRenderStoreAdapter();
    useViewerStore.getState().setBase(makeVolume("base4d.nii", 4));

    const onChange = vi.fn();
    track(
      adapter.subscribeVolume((change) => {
        onChange(change);
        adapter.getSnapshot();
      }),
    );

    useViewerStore.getState().setCross({ t: 2 });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not fire on in-plane crosshair movement", () => {
    const adapter = createVolumeRenderStoreAdapter();
    useViewerStore.getState().setBase(makeVolume("base.nii"));

    const onChange = vi.fn();
    track(adapter.subscribeVolume(onChange));

    useViewerStore.getState().setCross({ r: 1, a: 2 });

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("volume render adapter — getSnapshot", () => {
  it("carries warmed stats for the current timepoint", () => {
    const adapter = createVolumeRenderStoreAdapter();
    useViewerStore.getState().setBase(makeVolume("base4d.nii", 3));
    useViewerStore.getState().setCross({ t: 2 });

    const snapshot = adapter.getSnapshot();
    expect(snapshot.timeIndex).toBe(2);
    expect(snapshot.stats).not.toBeNull();
  });

  it("is a pure read — taking a snapshot never bumps statsVersion", () => {
    const adapter = createVolumeRenderStoreAdapter();
    useViewerStore.getState().setBase(makeVolume("base4d.nii", 3));

    const before = useViewerStore.getState().statsVersion;
    adapter.getSnapshot();
    adapter.getSnapshot();
    expect(useViewerStore.getState().statsVersion).toBe(before);
  });

  it("returns a null base and stats with no volume loaded", () => {
    const snapshot = createVolumeRenderStoreAdapter().getSnapshot();
    expect(snapshot.base).toBeNull();
    expect(snapshot.stats).toBeNull();
  });
});

describe("slice render adapter", () => {
  it("notifies the offscreen pass when its own slice axis moves", () => {
    const adapter = createSliceRenderStoreAdapter("s");
    useViewerStore.getState().setBase(makeVolume("base.nii"));

    const onChange = vi.fn();
    track(adapter.subscribeOffscreen(onChange));

    useViewerStore.getState().setCross({ s: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("leaves the offscreen pass alone when a different axis moves", () => {
    const adapter = createSliceRenderStoreAdapter("s");
    useViewerStore.getState().setBase(makeVolume("base.nii"));

    const onChange = vi.fn();
    track(adapter.subscribeOffscreen(onChange));

    useViewerStore.getState().setCross({ r: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("notifies the compositor on any crosshair movement", () => {
    const adapter = createSliceRenderStoreAdapter("s");
    useViewerStore.getState().setBase(makeVolume("base.nii"));

    const onChange = vi.fn();
    track(adapter.subscribeCompositor(onChange));

    useViewerStore.getState().setCross({ r: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("notifies the compositor when crosshair visibility toggles", () => {
    const adapter = createSliceRenderStoreAdapter("s");
    useViewerStore.getState().setBase(makeVolume("base.nii"));

    const onChange = vi.fn();
    track(adapter.subscribeCompositor(onChange));

    useViewerStore.getState().setCrosshairVisible(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
