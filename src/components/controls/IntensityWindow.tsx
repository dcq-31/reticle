"use client";

import { Histogram } from "@/components/controls/Histogram";
import { Chip, Hint, PanelGroup, Row } from "@/components/controls/primitives";
import { fmt } from "@/lib/utils/fmt";
import { useActiveLayer, useViewerStore } from "@/store";

export function IntensityWindow(): React.ReactElement | null {
  const layer = useActiveLayer();
  if (!layer) return null;
  const win = layer.display.win;
  const stats = layer.volume.stats;
  if (!stats) return null;
  const span = stats.max - stats.min || 1;

  const setW = (level: number, width: number) =>
    useViewerStore.getState().setActiveWindow({ level, width });

  return (
    <PanelGroup title="Intensity window">
      <Histogram />
      <Row label="Level" className="mt-2.5">
        <input
          aria-label="Window level"
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(((win.level - stats.min) / span) * 1000)}
          onChange={(e) => setW(stats.min + (+e.target.value / 1000) * span, win.width)}
          className="reticle-slider min-w-0 flex-1"
        />
        <input
          aria-label="Window level value"
          type="number"
          step="any"
          value={fmt(win.level)}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) setW(v, win.width);
          }}
          className="reticle-num w-[64px] flex-none"
        />
      </Row>
      <Row label="Window">
        <input
          aria-label="Window width"
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round((win.width / span) * 1000)}
          onChange={(e) => setW(win.level, (+e.target.value / 1000) * span)}
          className="reticle-slider min-w-0 flex-1"
        />
        <input
          aria-label="Window width value"
          type="number"
          step="any"
          value={fmt(win.width)}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) setW(win.level, v);
          }}
          className="reticle-num w-[64px] flex-none"
        />
      </Row>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Chip onClick={() => useViewerStore.getState().applyWindowPreset("auto")}>Auto 2–98%</Chip>
        <Chip onClick={() => useViewerStore.getState().applyWindowPreset("full")}>Full range</Chip>
        <Chip onClick={() => useViewerStore.getState().applyWindowPreset("robust")}>Robust</Chip>
      </div>
      <Hint>
        Drag inside any view with the right mouse button (or shift + left drag) to adjust
        window/level interactively.
      </Hint>
    </PanelGroup>
  );
}
