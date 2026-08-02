"use client";

import { PanelGroup } from "@/components/controls/primitives";
import { useViewerStore, type Layer } from "@/store";

export function LayerList(): React.ReactElement | null {
  const base = useViewerStore((s) => s.base);
  const overlays = useViewerStore((s) => s.overlays);
  const activeId = useViewerStore((s) => s.activeLayerId);

  if (!base) return null;

  return (
    <PanelGroup title="Layers">
      <ul className="flex flex-col gap-1">
        <LayerRow layer={base} kind="base" active={activeId === base.id} />
        {overlays.map((o) => (
          <LayerRow key={o.id} layer={o} kind="overlay" active={activeId === o.id} />
        ))}
      </ul>
    </PanelGroup>
  );
}

interface LayerRowProps {
  readonly layer: Layer;
  readonly kind: "base" | "overlay";
  readonly active: boolean;
}

function LayerRow({ layer, kind, active }: LayerRowProps): React.ReactElement {
  const visible = layer.display.visible;
  const setActive = (): void => useViewerStore.getState().setActiveLayer(layer.id);
  const toggleVisible = (): void =>
    useViewerStore.getState().setLayerVisibility(layer.id, !visible);
  const remove = (): void => useViewerStore.getState().removeLayer(layer.id);
  const setOpacity = (o: number): void => useViewerStore.getState().setLayerOpacity(layer.id, o);

  return (
    <li
      className={
        "border-line bg-surface-2 flex items-center gap-2 rounded border px-2 py-1.5 " +
        (active ? "border-accent shadow-[0_0_0_1px_var(--color-accent)]" : "")
      }
    >
      <button
        type="button"
        title={active ? "Active layer" : "Make active"}
        aria-label={active ? "Active layer" : "Make active layer"}
        aria-pressed={active}
        onClick={setActive}
        className={
          "h-3 w-3 flex-none cursor-pointer rounded-full border " +
          (active ? "bg-accent border-accent" : "border-line-bright bg-transparent")
        }
      />
      <button
        type="button"
        title={visible ? "Hide layer" : "Show layer"}
        aria-label={visible ? "Hide layer" : "Show layer"}
        aria-pressed={visible}
        onClick={toggleVisible}
        className={
          "flex-none cursor-pointer font-mono text-[12px] leading-none " +
          (visible ? "text-accent" : "text-faint")
        }
      >
        {visible ? "◉" : "○"}
      </button>
      <button
        type="button"
        onClick={setActive}
        className="text-fg flex-1 cursor-pointer truncate text-left font-mono text-[11px]"
        title={layer.volume.name}
      >
        {layer.volume.name}
        <span className="text-faint ml-1.5">{kind === "base" ? "base" : "overlay"}</span>
      </button>
      {kind === "overlay" ? (
        <>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(layer.display.opacity * 100)}
            onChange={(e) => setOpacity(+e.target.value / 100)}
            aria-label="Layer opacity"
            title={`Opacity ${Math.round(layer.display.opacity * 100)}%`}
            className="reticle-slider w-15 flex-none"
          />
          <button
            type="button"
            onClick={remove}
            title="Remove overlay"
            aria-label="Remove overlay"
            className="text-faint hover:text-danger flex-none cursor-pointer font-mono text-[12px] leading-none"
          >
            ×
          </button>
        </>
      ) : null}
    </li>
  );
}
