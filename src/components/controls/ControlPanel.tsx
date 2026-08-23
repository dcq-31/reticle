"use client";

import { ColormapPicker } from "@/components/controls/ColormapPicker";
import { HeaderMeta } from "@/components/controls/HeaderMeta";
import { IntensityWindow } from "@/components/controls/IntensityWindow";
import { LayerList } from "@/components/controls/LayerList";
import { TimeScrubber } from "@/components/controls/TimeScrubber";
import { VolumeControls } from "@/components/controls/VolumeControls";
import { PanelGroup } from "@/components/controls/primitives";
import { useViewerStore } from "@/store";

export function ControlPanel(): React.ReactElement {
  const isVolumeLayout = useViewerStore((s) => s.layout === "volume");
  return (
    <aside
      aria-label="Volume controls"
      className="bg-panel min-h-0 w-full overflow-x-hidden overflow-y-auto px-3.5 pt-3 pb-6 lg:h-full"
    >
      <TimeScrubber />
      <LayerList />
      <IntensityWindow />
      <ColormapPicker />
      {isVolumeLayout ? <VolumeControls /> : null}
      <HeaderMeta />
      <PanelGroup title="Keys" className="!mb-0">
        <p className="text-faint text-[10.5px] leading-relaxed">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> slice · <Kbd>scroll</Kbd> slice · <Kbd>ctrl</Kbd>+scroll zoom · <Kbd>R</Kbd>{" "}
          reset · <Kbd>C</Kbd> crosshair · <Kbd>I</Kbd> interpolation
        </p>
      </PanelGroup>
    </aside>
  );
}

function Kbd({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <kbd className="bg-surface-2 border-line-bright text-dim mx-0.5 rounded border border-b-2 px-1 py-0 font-mono text-[10px]">
      {children}
    </kbd>
  );
}
