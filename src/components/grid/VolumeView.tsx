"use client";

import { useCallback, useRef } from "react";

import { useResizeObserver } from "@/hooks/useResizeObserver";
import { useVolumeRenderer } from "@/hooks/useVolumeRenderer";
import { useViewerStore } from "@/store";

const MODE_LABEL: Record<"composite" | "mip" | "iso", string> = {
  composite: "DVR",
  mip: "MIP",
  iso: "Surface",
};

export function VolumeView(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { failed, setCanvasSize } = useVolumeRenderer(canvasRef);

  const onResize = useCallback(
    ({ width, height }: { width: number; height: number }) => {
      setCanvasSize(width, height);
    },
    [setCanvasSize],
  );
  useResizeObserver(containerRef, onResize);

  const mode = useViewerStore((s) => s.mode);
  const orientCode = useViewerStore((s) => s.base?.volume.orientCode ?? "");
  const dims = useViewerStore((s) => {
    const v = s.base?.volume;
    if (!v) return "";
    return `${v.dimsWorld[0]}×${v.dimsWorld[1]}×${v.dimsWorld[2]}`;
  });

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="3D volume view"
      className="group relative h-full min-h-0 w-full min-w-0 overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at 50% 38%, #0b1218 0%, #05080b 78%)",
        cursor: "grab",
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full touch-none" />
      <div className="text-accent border-line pointer-events-none absolute top-2 left-2 rounded border bg-black/55 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase select-none">
        3D · Volume
        <span className="text-dim ml-1.5">{MODE_LABEL[mode]}</span>
      </div>
      <div className="border-line text-faint pointer-events-none absolute bottom-2 left-2 rounded border bg-black/55 px-2 py-1 font-mono text-[10px] leading-relaxed select-none">
        <div>
          <span className="text-dim">Drag</span> rotate · <span className="text-dim">scroll</span>{" "}
          zoom · <span className="text-dim">shift/middle-drag</span> pan
        </div>
        {dims ? (
          <div className="text-dim mt-0.5">
            {dims} · {orientCode}
          </div>
        ) : null}
      </div>
      {failed ? <Fallback /> : null}
    </div>
  );
}

function Fallback(): React.ReactElement {
  return (
    <div className="text-dim absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-xs">
      <h3 className="text-danger m-0 text-sm tracking-[0.04em]">3D unavailable</h3>
      <p className="m-0">
        This view needs WebGL2 with 3D-texture support. Try a recent desktop browser with hardware
        acceleration enabled.
      </p>
    </div>
  );
}
