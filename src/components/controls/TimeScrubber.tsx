"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Hint, PanelGroup, Row } from "@/components/controls/primitives";
import { useViewerStore } from "@/store";

/** Playback interval (ms) — slower under prefers-reduced-motion. */
const FRAME_MS_DEFAULT = 120;
const FRAME_MS_REDUCED = 350;

/** Subscribe to `prefers-reduced-motion` via `useSyncExternalStore`. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

export function TimeScrubber(): React.ReactElement | null {
  const nt = useViewerStore((s) => s.base?.volume.nt ?? 1);
  const t = useViewerStore((s) => s.cross.t);
  const [wantsToPlay, setWantsToPlay] = useState(false);
  // Derive — when nt drops to 1, playback simply stops; no effect needed.
  const playing = wantsToPlay && nt > 1;
  const reducedMotion = useReducedMotion();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    const interval = reducedMotion ? FRAME_MS_REDUCED : FRAME_MS_DEFAULT;
    timerRef.current = window.setInterval(() => {
      const store = useViewerStore.getState();
      const total = store.base?.volume.nt ?? 1;
      const next = (store.cross.t + 1) % total;
      store.setCross({ t: next });
    }, interval);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [playing, reducedMotion]);

  if (nt <= 1) return null;

  return (
    <PanelGroup title="Volume / Time">
      <Row label="Volume">
        <input
          aria-label="Time index"
          type="range"
          min={0}
          max={nt - 1}
          step={1}
          value={t}
          onChange={(e) => {
            const next = Number(e.target.value);
            useViewerStore.getState().setCross({ t: next });
          }}
          className="reticle-slider min-w-0 flex-1"
        />
        <span className="text-accent w-[56px] flex-none text-right font-mono text-[11px]">{t}</span>
      </Row>
      <Row className="!mb-0">
        <button
          type="button"
          onClick={() => setWantsToPlay((p) => !p)}
          className="bg-surface-2 border-line-bright hover:border-line-bright cursor-pointer rounded border px-2.5 py-1.5 text-[11px] transition-colors hover:bg-[#18222c]"
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <Hint>4D series</Hint>
      </Row>
    </PanelGroup>
  );
}
