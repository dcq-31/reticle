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
import { useViewerStore } from "@/store";

export default function Viewer(): React.ReactElement {
  useKeyboardShortcuts();

  // Load the synthetic phantom on first mount so the tool is immediately usable.
  useEffect(() => {
    const store = useViewerStore.getState();
    if (store.base) return;
    const vol = makeDemoVolume();
    store.setBase(vol);
    store.setStatus(
      `${vol.name} · ${vol.nx}×${vol.ny}×${vol.nz} · ${vol.datatype} · ${vol.orientCode}`,
    );
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
