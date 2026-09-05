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
  it("reports volumeChanged: true when the base volume is swapped", () => {
    const adapter = createVolumeRenderStoreAdapter();
    useViewerStore.getState().setBase(makeVolume("first.nii"));

    const changes: VolumeChange[] = [];
    track(adapter.subscribeVolume((c) => changes.push(c)));

    useViewerStore.getState().setBase(makeVolume("second.nii"));

    expect(changes).toEqual([{ volumeChanged: true }]);
  });

  it("does not fire on in-plane crosshair movement", () => {
    const adapter = createVolumeRenderStoreAdapter();
    useViewerStore.getState().setBase(makeVolume("base.nii"));

    const onChange = vi.fn();
    track(adapter.subscribeVolume(onChange));

    useViewerStore.getState().setCross({ r: 1, a: 2 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not fire on timepoint change", () => {
    const adapter = createVolumeRenderStoreAdapter();
    useViewerStore.getState().setBase(makeVolume("base4d.nii", 4));

    const onChange = vi.fn();
    track(adapter.subscribeVolume(onChange));

    useViewerStore.getState().setCross({ t: 1 });

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("volume render adapter — subscribeTimeIndex", () => {
  it("fires on timepoint change", () => {
    const adapter = createVolumeRenderStoreAdapter();
    useViewerStore.getState().setBase(makeVolume("base4d.nii", 4));

    const onChange = vi.fn();
    track(adapter.subscribeTimeIndex(onChange));

    useViewerStore.getState().setCross({ t: 1 });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("fires exactly once per timepoint step", () => {
    const adapter = createVolumeRenderStoreAdapter();
    useViewerStore.getState().setBase(makeVolume("base4d.nii", 4));

    const onChange = vi.fn();
    track(
      adapter.subscribeTimeIndex(() => {
        onChange();
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
    track(adapter.subscribeTimeIndex(onChange));

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

describe("volume render adapter — subscribeDisplay", () => {
  it("does not fire when only an overlay display changes", () => {
    const base = makeVolume("base.nii");
    const overlay = makeVolume("overlay.nii");
    const store = useViewerStore.getState();
    store.setBase(base);
    store.addOverlay(overlay);

    const adapter = createVolumeRenderStoreAdapter();
    const onChange = vi.fn();
    track(adapter.subscribeDisplay(onChange));

    store.setLayerOpacity(overlay.id, 0.3);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("fires when the base display changes", () => {
    const base = makeVolume("base.nii");
    const store = useViewerStore.getState();
    store.setBase(base);

    const adapter = createVolumeRenderStoreAdapter();
    const onChange = vi.fn();
    track(adapter.subscribeDisplay(onChange));

    store.setActiveWindow({ level: 12, width: 24 });

    expect(onChange).toHaveBeenCalledTimes(1);
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
