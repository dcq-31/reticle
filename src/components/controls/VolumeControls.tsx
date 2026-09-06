"use client";

import { Chip, Hint, PanelGroup, Row, SegmentedControl } from "@/components/controls/primitives";
import { useViewerStore, type VolumeMode } from "@/store";

const MODE_OPTIONS: ReadonlyArray<{ value: VolumeMode; label: string }> = [
  { value: "composite", label: "Volume" },
  { value: "mip", label: "MIP" },
  { value: "iso", label: "Surface" },
];

const QUALITY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0.6, label: "Fast" },
  { value: 1, label: "Balanced" },
  { value: 1.8, label: "Fine" },
];

export function VolumeControls(): React.ReactElement {
  const mode = useViewerStore((s) => s.mode);
  const threshold = useViewerStore((s) => s.threshold);
  const density = useViewerStore((s) => s.density);
  const quality = useViewerStore((s) => s.quality);
  const shade = useViewerStore((s) => s.shade);
  const thresholdSliderId = "volume-threshold-slider";
  const densitySliderId = "volume-density-slider";

  const isIso = mode === "iso";
  const isMip = mode === "mip";

  return (
    <PanelGroup title="3D Rendering">
      <Row className="mb-2">
        <SegmentedControl
          label="Render mode"
          value={mode}
          options={MODE_OPTIONS}
          fullWidth
          onChange={(v) => useViewerStore.getState().setVolumeMode(v)}
        />
      </Row>
      <Row label={isIso ? "Iso level" : "Threshold"} labelFor={thresholdSliderId}>
        <input
          id={thresholdSliderId}
          aria-label={isIso ? "Iso level" : "Threshold"}
          type="range"
          min={0}
          max={1000}
          value={Math.round(threshold * 1000)}
          onChange={(e) => useViewerStore.getState().setVolumeThreshold(+e.target.value / 1000)}
          className="reticle-slider min-w-0 flex-1"
        />
        <span className="text-accent w-14 flex-none text-right font-mono text-[11px]">
          {threshold.toFixed(2)}
        </span>
      </Row>
      {isMip ? null : (
        <Row label="Density" labelFor={densitySliderId}>
          <input
            id={densitySliderId}
            aria-label="Density"
            type="range"
            min={1}
            max={600}
            value={Math.round(density * 100)}
            onChange={(e) => useViewerStore.getState().setVolumeDensity(+e.target.value / 100)}
            className="reticle-slider min-w-0 flex-1"
          />
          <span className="text-accent w-14 flex-none text-right font-mono text-[11px]">
            {density.toFixed(1)}
          </span>
        </Row>
      )}
      <Row className="mb-2">
        <SegmentedControl
          label="Step quality"
          value={String(quality)}
          options={QUALITY_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
          fullWidth
          onChange={(v) => useViewerStore.getState().setVolumeQuality(Number(v))}
        />
      </Row>
      <div className="flex flex-wrap gap-1.5">
        <Chip on={shade} onClick={() => useViewerStore.getState().setVolumeShade(!shade)}>
          Shading
        </Chip>
        <Chip onClick={() => useViewerStore.getState().resetVolumeView()}>Reset view</Chip>
      </div>
      <Hint>
        MIP projects the brightest voxel along each ray. Volume composites a transfer function with
        depth. Surface renders the first voxel above the threshold.
      </Hint>
    </PanelGroup>
  );
}
