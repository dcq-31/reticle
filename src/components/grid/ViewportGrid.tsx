"use client";

import { ControlPanel } from "@/components/controls/ControlPanel";
import { SliceView } from "@/components/grid/SliceView";
import { VolumeView } from "@/components/grid/VolumeView";
import type { Plane } from "@/lib/geometry/planes";
import { useViewerStore } from "@/store";

const ALL_PLANES: readonly Plane[] = ["axial", "coronal", "sagittal"];

export function ViewportGrid(): React.ReactElement {
  const layout = useViewerStore((s) => s.layout);
  const maxView = useViewerStore((s) => s.maxView);

  const volume = layout === "volume";
  const single = (layout === "single" || maxView !== null) && !volume;
  const focused: Plane = maxView ?? "axial";

  if (volume) {
    return (
      <div className="bg-line grid min-h-0 flex-1 grid-cols-[1fr_340px] gap-[2px] p-[2px]">
        <VolumeView />
        <ControlPanel />
      </div>
    );
  }

  if (single) {
    return (
      <div className="bg-line grid min-h-0 flex-1 grid-cols-1 grid-rows-1 gap-[2px] p-[2px]">
        <SliceView plane={focused} />
      </div>
    );
  }

  return (
    <div className="bg-line grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-[2px] p-[2px]">
      {ALL_PLANES.map((p) => (
        <SliceView key={p} plane={p} />
      ))}
      <ControlPanel />
    </div>
  );
}
