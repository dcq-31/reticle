import { beforeEach, describe, expect, it } from "vitest";

import { parseNiftiBuffer } from "@/lib/imaging/nifti/adapter";
import type { Volume } from "@/lib/imaging/types";
import { useViewerStore } from "@/store";
import { selectActiveLayer } from "@/store/volumeSlice";

import { buildNifti1Buffer } from "../fixtures/nifti";

function makeVolume(
  name: string,
  opts: { nx?: number; ny?: number; nz?: number; nt?: number } = {},
): Volume {
  const { nx = 4, ny = 4, nz = 4, nt = 1 } = opts;
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

beforeEach(() => {
  useViewerStore.getState().clearVolumes();
});

describe("setBase", () => {
  it("installs the volume as the sole base layer and centers the crosshair", () => {
    const volume = makeVolume("base.nii", { nx: 8, ny: 6, nz: 4 });
    useViewerStore.getState().setBase(volume);

    const state = useViewerStore.getState();
    expect(state.base?.volume.id).toBe(volume.id);
    expect(state.overlays).toHaveLength(0);
    expect(state.activeLayerId).toBe(volume.id);
    expect(state.getLayerRole(volume.id)).toBe("base");
    expect(state.cross).toEqual({ r: 4, a: 3, s: 2, t: 0 });
  });

  it("warms stats for the new base at t=0", () => {
    const volume = makeVolume("base.nii");
    useViewerStore.getState().setBase(volume);
    expect(useViewerStore.getState().getStatsForLayer(volume.id, 0)).not.toBeNull();
  });

  it("evicts cache entries belonging to the replaced volume", () => {
    const first = makeVolume("first.nii");
    const second = makeVolume("second.nii");
    const store = useViewerStore.getState();
    store.setBase(first);
    store.setBase(second);

    const state = useViewerStore.getState();
    expect(state.getStatsForVolume(second.id, 0)).not.toBeNull();
    expect(state.getStatsForVolume(first.id, 0)).toBeNull();
  });

  it("rebuilds cache with only the new base when reinstalling the same volume", () => {
    const volume = makeVolume("base4d.nii", { nt: 3 });
    const store = useViewerStore.getState();
    store.setBase(volume);
    store.setCross({ t: 2 });

    const warmedVersion = useViewerStore.getState().statsVersion;

    store.setBase(volume);

    const state = useViewerStore.getState();
    const keysAfter = Object.keys(state.derivedCache.statsByKey);
    expect(keysAfter.length).toBe(1);
    expect(keysAfter[0]).toContain(volume.id);
    expect(state.statsVersion).toBeGreaterThanOrEqual(warmedVersion);
    expect(state.getStatsForVolume(volume.id, 0)).not.toBeNull();
  });
});

describe("addOverlay", () => {
  it("appends an overlay and makes it the active layer", () => {
    const base = makeVolume("base.nii");
    const overlay = makeVolume("overlay.nii");
    const store = useViewerStore.getState();
    store.setBase(base);
    store.addOverlay(overlay);

    const state = useViewerStore.getState();
    expect(state.base?.id).toBe(base.id);
    expect(state.overlays.map((l) => l.id)).toEqual([overlay.id]);
    expect(state.activeLayerId).toBe(overlay.id);
    expect(state.getLayerRole(overlay.id)).toBe("overlay");
    expect(state.overlays[0]?.display.opacity).toBeLessThan(1);
  });

  it("warms overlay stats at the crosshair's current timepoint", () => {
    const base = makeVolume("base4d.nii", { nt: 3 });
    const overlay = makeVolume("overlay4d.nii", { nt: 3 });
    const store = useViewerStore.getState();
    store.setBase(base);
    store.setCross({ t: 2 });
    store.addOverlay(overlay);

    expect(useViewerStore.getState().getStatsForLayer(overlay.id, 2)).not.toBeNull();
  });

  it("clamps the warm timepoint to an overlay with fewer frames than the base", () => {
    const base = makeVolume("base4d.nii", { nt: 4 });
    const overlay = makeVolume("overlay3d.nii", { nt: 1 });
    const store = useViewerStore.getState();
    store.setBase(base);
    store.setCross({ t: 3 });
    store.addOverlay(overlay);

    const stats = useViewerStore.getState().getStatsForLayer(overlay.id, 3);
    expect(stats).not.toBeNull();
    expect(Number.isFinite(stats!.min)).toBe(true);
    expect(Number.isFinite(stats!.max)).toBe(true);
  });
});

describe("removeLayer", () => {
  it("drops an overlay and its cached stats, keeping the base", () => {
    const base = makeVolume("base.nii");
    const overlay = makeVolume("overlay.nii");
    const store = useViewerStore.getState();
    store.setBase(base);
    store.addOverlay(overlay);
    store.removeLayer(overlay.id);

    const state = useViewerStore.getState();
    expect(state.overlays).toHaveLength(0);
    expect(state.base?.id).toBe(base.id);
    expect(state.activeLayerId).toBe(base.id);
    expect(state.getStatsForVolume(overlay.id, 0)).toBeNull();
    expect(state.getStatsForVolume(base.id, 0)).not.toBeNull();
  });

  it("clears the whole document when the base is removed", () => {
    const base = makeVolume("base.nii");
    const overlay = makeVolume("overlay.nii");
    const store = useViewerStore.getState();
    store.setBase(base);
    store.addOverlay(overlay);
    store.removeLayer(base.id);

    const state = useViewerStore.getState();
    expect(state.base).toBeNull();
    expect(state.overlays).toHaveLength(0);
    expect(state.document.layers).toHaveLength(0);
    expect(state.activeLayerId).toBeNull();
  });
});

describe("setCross", () => {
  it("clamps coordinates to the base volume bounds", () => {
    useViewerStore.getState().setBase(makeVolume("base.nii", { nx: 4, ny: 4, nz: 4 }));
    const store = useViewerStore.getState();

    store.setCross({ r: 99, a: -5, s: 3 });
    expect(useViewerStore.getState().cross).toMatchObject({ r: 3, a: 0, s: 3 });
  });

  it("clamps the timepoint to the volume's frame count", () => {
    useViewerStore.getState().setBase(makeVolume("base4d.nii", { nt: 3 }));
    useViewerStore.getState().setCross({ t: 99 });
    expect(useViewerStore.getState().cross.t).toBe(2);
  });

  it("warms stats for every layer atomically when the timepoint changes", () => {
    const base = makeVolume("base4d.nii", { nt: 3 });
    const overlay = makeVolume("overlay4d.nii", { nt: 3 });
    const store = useViewerStore.getState();
    store.setBase(base);
    store.addOverlay(overlay);

    const before = useViewerStore.getState().statsVersion;
    useViewerStore.getState().setCross({ t: 1 });
    const state = useViewerStore.getState();

    expect(state.cross.t).toBe(1);
    expect(state.getStatsForLayer(base.id, 1)).not.toBeNull();
    expect(state.getStatsForLayer(overlay.id, 1)).not.toBeNull();
    expect(state.statsVersion).toBeGreaterThan(before);
  });

  it("does not touch the stats cache on in-plane movement", () => {
    useViewerStore.getState().setBase(makeVolume("base.nii"));
    const before = useViewerStore.getState();
    const versionBefore = before.statsVersion;
    const cacheBefore = before.derivedCache;

    useViewerStore.getState().setCross({ r: 1, a: 2 });

    const after = useViewerStore.getState();
    expect(after.statsVersion).toBe(versionBefore);
    expect(after.derivedCache).toBe(cacheBefore);
  });
});

describe("getStatsForLayer", () => {
  it("is a pure read — never mutates the store", () => {
    const base = makeVolume("base4d.nii", { nt: 3 });
    useViewerStore.getState().setBase(base);

    const before = useViewerStore.getState();
    const versionBefore = before.statsVersion;
    const cacheBefore = before.derivedCache;

    const missing = before.getStatsForLayer(base.id, 2);

    const after = useViewerStore.getState();
    expect(missing).toBeNull();
    expect(after.statsVersion).toBe(versionBefore);
    expect(after.derivedCache).toBe(cacheBefore);
  });

  it("returns null when no layer is loaded", () => {
    expect(useViewerStore.getState().getStatsForLayer()).toBeNull();
  });
});

describe("selectActiveLayer", () => {
  it("falls back to the base when activeLayerId is stale", () => {
    const base = makeVolume("base.nii");
    const store = useViewerStore.getState();
    store.setBase(base);
    store.setActiveLayer("no-such-layer");

    expect(selectActiveLayer(useViewerStore.getState())?.id).toBe(base.id);
  });

  it("returns the overlay when it is active", () => {
    const base = makeVolume("base.nii");
    const overlay = makeVolume("overlay.nii");
    const store = useViewerStore.getState();
    store.setBase(base);
    store.addOverlay(overlay);

    expect(selectActiveLayer(useViewerStore.getState())?.id).toBe(overlay.id);
  });
});

describe("applyWindowPreset", () => {
  it("sets the window to the full intensity range", () => {
    const base = makeVolume("base.nii");
    const store = useViewerStore.getState();
    store.setBase(base);
    store.applyWindowPreset("full");

    const stats = useViewerStore.getState().getStatsForLayer(base.id)!;
    const win = useViewerStore.getState().base!.display.win;
    expect(win.level).toBeCloseTo((stats.min + stats.max) / 2, 5);
    expect(win.width).toBeCloseTo(stats.max - stats.min, 5);
  });

  it("sets the window to the robust percentile range for 'auto'", () => {
    const base = makeVolume("base.nii");
    const store = useViewerStore.getState();
    store.setBase(base);
    store.applyWindowPreset("auto");

    const stats = useViewerStore.getState().getStatsForLayer(base.id)!;
    const win = useViewerStore.getState().base!.display.win;
    expect(win.level).toBeCloseTo((stats.p2 + stats.p98) / 2, 5);
    expect(win.width).toBeCloseTo(stats.p98 - stats.p2, 5);
  });

  it("pads the range for 'robust'", () => {
    const base = makeVolume("base.nii");
    const store = useViewerStore.getState();
    store.setBase(base);
    store.applyWindowPreset("auto");
    const autoWidth = useViewerStore.getState().base!.display.win.width;
    store.applyWindowPreset("robust");
    const robustWidth = useViewerStore.getState().base!.display.win.width;

    expect(robustWidth).toBeGreaterThan(autoWidth);
  });

  it("is a no-op with no layer loaded", () => {
    expect(() => useViewerStore.getState().applyWindowPreset("auto")).not.toThrow();
  });
});

describe("layer display mutations", () => {
  it("clamps opacity into 0..1", () => {
    const base = makeVolume("base.nii");
    const overlay = makeVolume("overlay.nii");
    const store = useViewerStore.getState();
    store.setBase(base);
    store.addOverlay(overlay);

    store.setLayerOpacity(overlay.id, 5);
    expect(useViewerStore.getState().overlays[0]?.display.opacity).toBe(1);
    store.setLayerOpacity(overlay.id, -2);
    expect(useViewerStore.getState().overlays[0]?.display.opacity).toBe(0);
  });

  it("keeps the LUT in sync with colormap and invert changes", () => {
    const base = makeVolume("base.nii");
    const store = useViewerStore.getState();
    store.setBase(base);

    const grayLut = useViewerStore.getState().base!.display.lut;
    store.setActiveCmap("hot");
    const hotLut = useViewerStore.getState().base!.display.lut;
    expect(hotLut).not.toBe(grayLut);

    store.setActiveInvert(true);
    const invertedLut = useViewerStore.getState().base!.display.lut;
    expect(useViewerStore.getState().base!.display.invert).toBe(true);
    expect(invertedLut).not.toBe(hotLut);
  });

  it("enforces a non-zero window width", () => {
    useViewerStore.getState().setBase(makeVolume("base.nii"));
    useViewerStore.getState().setActiveWindow({ level: 10, width: 0 });
    expect(useViewerStore.getState().base!.display.win.width).toBeGreaterThan(0);
  });
});
