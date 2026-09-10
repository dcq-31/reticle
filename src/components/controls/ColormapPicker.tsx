"use client";

import { memo, useMemo } from "react";

import { Chip, PanelGroup } from "@/components/controls/primitives";
import { buildLUT, COLORMAP_NAMES, LUT_SIZE, type ColormapName } from "@/lib/render/colormap";
import { useActiveLayer, useViewerStore } from "@/store";

/** Pre-compute CSS gradients for each colormap once at module load. */
const GRADIENT_BY_NAME: Readonly<Record<ColormapName, string>> = Object.fromEntries(
  COLORMAP_NAMES.map((name) => [name, gradientFor(name)]),
) as Readonly<Record<ColormapName, string>>;

function gradientFor(name: ColormapName): string {
  const lut = buildLUT(name, false);
  const stops: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const ci = Math.round((i / 10) * (LUT_SIZE - 1)) * 3;
    stops.push(`rgb(${lut[ci]},${lut[ci + 1]},${lut[ci + 2]}) ${i * 10}%`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

export const ColormapPicker = memo(function ColormapPicker(): React.ReactElement | null {
  const layer = useActiveLayer();
  const cmap = layer?.display.cmap;
  const invert = layer?.display.invert ?? false;
  const crosshairVisible = useViewerStore((s) => s.crosshairVisible);

  const swatches = useMemo(
    () =>
      COLORMAP_NAMES.map((name) => ({
        name,
        gradient: GRADIENT_BY_NAME[name],
      })),
    [],
  );

  if (!layer) return null;

  return (
    <PanelGroup title="Colormap">
      <div className="grid grid-cols-3 gap-1.5">
        {swatches.map(({ name, gradient }) => {
          const on = name === cmap;
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => useViewerStore.getState().setActiveCmap(name)}
              className={
                "border-line bg-surface cursor-pointer overflow-hidden rounded border transition-colors " +
                (on
                  ? "border-accent shadow-[0_0_0_1px_var(--color-accent)]"
                  : "hover:border-line-bright")
              }
            >
              <div style={{ background: gradient }} className="h-4 w-full" />
              <div
                className={
                  "px-0 py-1 text-center text-[9.5px] tracking-wide " +
                  (on ? "text-accent" : "text-dim")
                }
              >
                {name}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Chip on={invert} onClick={() => useViewerStore.getState().setActiveInvert(!invert)}>
          Invert
        </Chip>
        <Chip
          on={crosshairVisible}
          onClick={() => useViewerStore.getState().setCrosshairVisible(!crosshairVisible)}
        >
          Crosshair
        </Chip>
      </div>
    </PanelGroup>
  );
});
