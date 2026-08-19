"use client";

import { useEffect, useRef } from "react";

import { fmt } from "@/lib/utils/fmt";
import {
  useActiveLayer,
  useActiveLayerStats,
  useViewerStore,
  type Layer,
  type LayerId,
} from "@/store";

const CANVAS_W = 600;
const CANVAS_H = 96;
/** Pixel tolerance for picking up a draggable window edge. */
const EDGE_HIT_PX = 8;

export function Histogram(): React.ReactElement | null {
  const layer = useActiveLayer();
  const stats = useActiveLayerStats();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Redraw whenever stats or window change.
  useEffect(() => {
    drawHistogram(canvasRef.current, layer, stats);
  }, [layer, stats]);

  if (!layer || !stats) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const win = layer.display.win;
    const x = pickX(e, canvas);
    const span = stats.max - stats.min || 1;
    const xLo = ((win.level - win.width / 2 - stats.min) / span) * canvas.width;
    const xHi = ((win.level + win.width / 2 - stats.min) / span) * canvas.width;
    const mode: HistMode =
      Math.abs(x - xLo) < EDGE_HIT_PX ? "lo" : Math.abs(x - xHi) < EDGE_HIT_PX ? "hi" : "move";
    canvas.dataset.histMode = mode;
    applyDrag(e, canvas, mode, layer.id);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mode = (canvas.dataset.histMode as HistMode | undefined) ?? null;
    if (!mode) return;
    applyDrag(e, canvas, mode, layer.id);
  };

  const endDrag = (): void => {
    const canvas = canvasRef.current;
    if (canvas) delete canvas.dataset.histMode;
  };

  return (
    <div>
      <div className="border-line bg-bg relative rounded border">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block h-24 w-full cursor-ew-resize"
          aria-label="Intensity histogram with draggable window edges"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      </div>
      <div className="text-faint mt-1 flex justify-between font-mono text-[10px]">
        <span>{fmt(stats.min)}</span>
        <span>{fmt(stats.max)}</span>
      </div>
    </div>
  );
}

type HistMode = "lo" | "hi" | "move";

function pickX(e: { clientX: number }, canvas: HTMLCanvasElement): number {
  const rect = canvas.getBoundingClientRect();
  const offset = e.clientX - rect.left;
  // Use the canvas backing-store coordinate space so threshold checks line
  // up with the values we computed from window/level.
  return offset * (canvas.width / rect.width);
}

function applyDrag(
  e: { clientX: number },
  canvas: HTMLCanvasElement,
  mode: HistMode,
  layerId: LayerId,
): void {
  // Read the latest layer from the store at drag time (the layer arg in the
  // closure above is stable, but the layer's display may have moved since).
  const state = useViewerStore.getState();
  const layer = state.document.layers.find((entry) => entry.id === layerId) ?? state.base;
  if (!layer) return;
  const stats = state.getStatsForLayer(layer.id);
  if (!stats) return;
  const win = layer.display.win;
  const span = stats.max - stats.min || 1;
  const x = pickX(e, canvas);
  const value = stats.min + (x / canvas.width) * span;

  if (mode === "move") {
    state.setActiveWindow({ level: value, width: win.width });
    return;
  }
  let lo = win.level - win.width / 2;
  let hi = win.level + win.width / 2;
  if (mode === "lo") lo = value;
  else hi = value;
  if (hi <= lo) return;
  state.setActiveWindow({ level: (lo + hi) / 2, width: hi - lo });
}

function drawHistogram(
  canvas: HTMLCanvasElement | null,
  layer: Layer | null,
  stats: ReturnType<typeof useActiveLayerStats>,
): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!layer) return;
  if (!stats) return;
  const hist = stats.histogram;
  const NB = hist.length;
  let mx = 0;
  for (let i = 1; i < NB; i++) if (hist[i]! > mx) mx = hist[i]!;
  if (mx <= 0) mx = 1;

  // bars (sqrt scaling so quiet tails still show).
  ctx.fillStyle = "#26323d";
  const bw = W / NB;
  for (let i = 0; i < NB; i++) {
    const hh = Math.sqrt(hist[i]! / mx) * (H - 6);
    ctx.fillRect(i * bw, H - hh, Math.ceil(bw), hh);
  }

  const span = stats.max - stats.min || 1;
  const win = layer.display.win;
  const xLo = Math.max(0, ((win.level - win.width / 2 - stats.min) / span) * W);
  const xHi = Math.min(W, ((win.level + win.width / 2 - stats.min) / span) * W);

  ctx.fillStyle = "rgba(45,212,191,0.13)";
  ctx.fillRect(xLo, 0, xHi - xLo, H);
  ctx.strokeStyle = "#2dd4bf";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(xLo, 0);
  ctx.lineTo(xLo, H);
  ctx.moveTo(xHi, 0);
  ctx.lineTo(xHi, H);
  ctx.stroke();

  const xc = ((win.level - stats.min) / span) * W;
  ctx.strokeStyle = "rgba(246,166,35,0.8)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(xc, 0);
  ctx.lineTo(xc, H);
  ctx.stroke();
  ctx.setLineDash([]);
}
