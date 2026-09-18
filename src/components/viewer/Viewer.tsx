"use client";

import { useEffect } from "react";

import { ViewportGrid } from "@/components/grid/ViewportGrid";
import { DropOverlay } from "@/components/viewer/DropOverlay";
import { ErrorBoundary } from "@/components/viewer/ErrorBoundary";
import { MobileLayersSheet } from "@/components/viewer/MobileLayersSheet";
import { StatusBar } from "@/components/viewer/StatusBar";
import { Toast } from "@/components/viewer/Toast";
import { Toolbar } from "@/components/viewer/Toolbar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { makeDemoVolume } from "@/lib/imaging/nifti/demo";
import { loadSampleBrain, sampleStatus } from "@/lib/imaging/sampleBrain";
import { useViewerStore } from "@/store";

export default function Viewer(): React.ReactElement {
  useKeyboardShortcuts();

  // Load the bundled MNI152 sample on first mount so the tool is immediately
  // usable. Falls back to the synthetic phantom if the sample cannot be
  // fetched or parsed (e.g. offline or missing asset).
  useEffect(() => {
    const store = useViewerStore.getState();
    if (store.base) return;
    const controller = new AbortController();
    let cancelled = false;
    store.setLoading(true);
    store.setJobStatus("loading");
    store.setStatus("Loading sample brain…");
    void (async () => {
      try {
        const loaded = await loadSampleBrain(controller.signal);
        if (cancelled) return;
        const s = useViewerStore.getState();
        if (s.base) return;
        s.setBase(loaded.volume, loaded.stats);
        s.setStatus(sampleStatus(loaded.volume));
        s.setJobStatus("success");
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        console.error("[Viewer] sample brain failed, using phantom:", err);
        const s = useViewerStore.getState();
        if (s.base) return;
        const vol = makeDemoVolume();
        s.setBase(vol);
        s.setStatus(sampleStatus(vol));
        s.setJobStatus("success");
        s.showToast("Sample brain unavailable — loaded synthetic phantom", "error");
      } finally {
        if (!cancelled) useViewerStore.getState().setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return (
    <ErrorBoundary>
      <div className="flex min-h-[100dvh] flex-col overflow-x-hidden">
        <Toolbar />
        <ViewportGrid />
        <StatusBar />
        <MobileLayersSheet />
        <DropOverlay />
        <Toast />
      </div>
    </ErrorBoundary>
  );
}
