"use client";

import { ControlPanel } from "@/components/controls/ControlPanel";
import { SliceView } from "@/components/grid/SliceView";
import { VolumeView } from "@/components/grid/VolumeView";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { type Plane, PLANE_LABEL } from "@/lib/geometry/planes";
import { DESKTOP_BP } from "@/lib/utils/constants";
import { useViewerStore } from "@/store";

const ALL_PLANES: readonly Plane[] = ["axial", "coronal", "sagittal"];

export function ViewportGrid(): React.ReactElement {
  const isDesktop = useMediaQuery(DESKTOP_BP);
  const layout = useViewerStore((s) => s.layout);
  const maxView = useViewerStore((s) => s.maxView);

  if (!isDesktop) {
    return <MobileViewportGrid layout={layout} />;
  }

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

function MobileViewportGrid({
  layout,
}: {
  readonly layout: "grid" | "single" | "volume";
}): React.ReactElement {
  const volume = layout === "volume";
  const focused = useViewerStore((s) => s.mobilePlane);
  const setMobilePlane = useViewerStore((s) => s.setMobilePlane);

  return (
    <div className="bg-line flex min-h-0 flex-1 flex-col gap-[2px] p-[2px]">
      {volume ? (
        <div className="flex min-h-[44svh] flex-1 flex-col overflow-hidden">
          <VolumeView />
        </div>
      ) : (
        <>
          <div className="bg-panel border-line flex flex-none flex-wrap items-center gap-2 border px-3 py-2">
            <span className="text-faint font-mono text-[10px] tracking-[0.14em] uppercase">
              Single view
            </span>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {ALL_PLANES.map((plane) => {
                const active = focused === plane;
                return (
                  <button
                    key={plane}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setMobilePlane(plane)}
                    className={
                      "border-line-bright flex-1 rounded border px-2 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase " +
                      (active ? "bg-accent font-semibold text-[#04201c]" : "bg-surface-2 text-dim")
                    }
                  >
                    {PLANE_LABEL[plane]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex min-h-[44svh] flex-1 flex-col overflow-hidden">
            <SliceView plane={focused} />
          </div>
        </>
      )}
      <details className="bg-panel border-line flex-none overflow-hidden rounded border">
        <summary className="text-dim cursor-pointer list-none px-3 py-2 font-mono text-[10px] tracking-[0.14em] uppercase">
          Controls
        </summary>
        <div className="border-line max-h-[42svh] overflow-y-auto border-t">
          <ControlPanel showLayers={false} />
        </div>
      </details>
    </div>
  );
}
