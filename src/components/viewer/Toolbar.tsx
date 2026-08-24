"use client";

import { useRef } from "react";

import { useFileOpen } from "@/hooks/useFileOpen";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { makeDemoVolume } from "@/lib/imaging/nifti/demo";
import { useViewerStore } from "@/store";

export function Toolbar(): React.ReactElement {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const layout = useViewerStore((s) => s.layout);
  const convention = useViewerStore((s) => s.convention);
  const interp = useViewerStore((s) => s.interp);
  const status = useViewerStore((s) => s.status);
  const loading = useViewerStore((s) => s.loading);
  const overlayCount = useViewerStore((s) => s.overlays.length);
  const mobileLayersOpen = useViewerStore((s) => s.mobileLayersOpen);
  const { openBase, openOverlay } = useFileOpen();
  const baseInputRef = useRef<HTMLInputElement | null>(null);
  const overlayInputRef = useRef<HTMLInputElement | null>(null);
  const hasBase = useViewerStore((s) => s.base !== null);

  const onReset = (): void => {
    const store = useViewerStore.getState();
    const base = store.base;
    if (base) {
      const v = base.volume;
      store.setCross({
        r: v.dimsWorld[0] >> 1,
        a: v.dimsWorld[1] >> 1,
        s: v.dimsWorld[2] >> 1,
        t: store.cross.t,
      });
      store.applyWindowPreset("auto");
    }
    store.bumpResetSeq();
    store.resetVolumeView();
  };

  const onLoadDemo = (): void => {
    const store = useViewerStore.getState();
    const vol = makeDemoVolume();
    store.setBase(vol);
    store.setStatus(
      `${vol.name} · ${vol.nx}×${vol.ny}×${vol.nz} · ${vol.datatype} · ${vol.orientCode}`,
    );
    store.showToast("Loaded synthetic phantom");
  };

  return (
    <header
      className="border-line flex flex-wrap items-center gap-2 border-b px-3 py-2 sm:h-12 sm:px-3.5"
      style={{ background: "linear-gradient(180deg,#0d141b,#0a1015)" }}
    >
      <Brand />
      <Divider />
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="text-dim order-2 flex-1 basis-full truncate font-mono text-[10px] leading-tight sm:order-none sm:basis-auto sm:text-[11px]"
      >
        {status}
      </div>
      <div className="order-3 flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto">
        <SegControl
          label="Convention"
          value={convention}
          options={[
            { value: "neuro", label: "Neuro" },
            { value: "radio", label: "Radio" },
          ]}
          onChange={(v) => useViewerStore.getState().setConvention(v)}
        />
        <SegControl
          label="Interpolation"
          value={interp}
          options={[
            { value: "sharp", label: "Sharp" },
            { value: "smooth", label: "Smooth" },
          ]}
          onChange={(v) => useViewerStore.getState().setInterp(v)}
        />
        {isDesktop ? (
          <SegControl
            label="Layout"
            value={layout}
            options={[
              { value: "grid", label: "Grid" },
              { value: "single", label: "Single" },
              { value: "volume", label: "3D" },
            ]}
            onChange={(v) => useViewerStore.getState().setLayout(v)}
          />
        ) : (
          <>
            <button
              type="button"
              aria-label={layout === "volume" ? "Return to slices" : "Switch to 3D"}
              onClick={() =>
                useViewerStore.getState().setLayout(layout === "volume" ? "grid" : "volume")
              }
              className={
                "border-line-bright rounded border px-3 py-1.5 text-[11px] font-semibold transition-colors " +
                (layout === "volume"
                  ? "bg-surface-2 text-dim hover:text-fg hover:bg-[#18222c]"
                  : "bg-accent text-[#04201c] hover:bg-[#3fe3ce]")
              }
            >
              {layout === "volume" ? "Slices" : "3D"}
            </button>
            <button
              type="button"
              aria-label="Overlays"
              aria-pressed={mobileLayersOpen}
              onClick={() => useViewerStore.getState().setMobileLayersOpen(!mobileLayersOpen)}
              className={
                "border-line-bright relative rounded border px-3 py-1.5 text-[11px] font-semibold transition-colors " +
                (mobileLayersOpen
                  ? "bg-accent text-[#04201c] hover:bg-[#3fe3ce]"
                  : "bg-surface-2 text-dim hover:text-fg hover:bg-[#18222c]")
              }
            >
              Overlays
              <span
                aria-hidden
                className="bg-line text-fg ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-none"
              >
                {overlayCount}
              </span>
            </button>
          </>
        )}
      </div>
      <div className="order-4 flex w-full flex-wrap items-center gap-2 sm:order-none sm:ml-auto sm:w-auto">
        <button
          type="button"
          title="Reset views"
          aria-label="Reset views"
          onClick={onReset}
          className="border-line text-dim hover:text-fg hover:border-line-bright flex h-8 w-8 cursor-pointer items-center justify-center rounded border transition-colors"
        >
          ⟳
        </button>
        <button
          type="button"
          onClick={() => baseInputRef.current?.click()}
          className="bg-surface-2 text-fg border-line-bright cursor-pointer rounded border px-3 py-1.5 text-xs transition-colors hover:bg-[#18222c] sm:px-3"
        >
          Open file
        </button>
        <input
          ref={baseInputRef}
          type="file"
          accept=".nii,.nii.gz,.gz"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void openBase(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={loading || !hasBase}
          title={hasBase ? "Add an overlay on top of the base volume" : "Load a base volume first"}
          onClick={() => overlayInputRef.current?.click()}
          className="bg-surface-2 text-fg border-line-bright cursor-pointer rounded border px-3 py-1.5 text-xs transition-colors hover:bg-[#18222c] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add overlay
        </button>
        <input
          ref={overlayInputRef}
          type="file"
          accept=".nii,.nii.gz,.gz"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void openOverlay(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={loading}
          className="bg-accent cursor-pointer rounded border border-transparent px-3 py-1.5 text-xs font-semibold text-[#04201c] transition-colors hover:bg-[#3fe3ce] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onLoadDemo}
        >
          Load sample brain
        </button>
      </div>
    </header>
  );
}

function Brand(): React.ReactElement {
  return (
    <div className="flex flex-none items-center gap-2 select-none">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9.2" stroke="#2dd4bf" strokeWidth="1.4" />
        <circle cx="12" cy="12" r="2.1" fill="#f6a623" />
        <path
          d="M12 1.5V7M12 17v5.5M1.5 12H7M17 12h5.5"
          stroke="#2dd4bf"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-xs font-semibold tracking-[0.14em] uppercase">
        <span className="text-accent">Reticle</span>
      </span>
      <span className="text-faint hidden font-mono text-[10px] sm:inline">v0.1 · NIfTI · 3D</span>
    </div>
  );
}

function Divider(): React.ReactElement {
  return <div className="bg-line h-6 w-px" />;
}

interface SegOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

interface SegControlProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly SegOption<T>[];
  readonly onChange: (value: T) => void;
}

function SegControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegControlProps<T>): React.ReactElement {
  return (
    <div
      role="group"
      aria-label={label}
      className="border-line-bright flex w-full overflow-hidden rounded border sm:inline-flex sm:w-auto"
    >
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(opt.value)}
            className={
              "border-line flex-1 cursor-pointer px-2.5 py-1.5 text-[11px] transition-colors not-first:border-l first:border-l-0 sm:flex-none " +
              (on
                ? "bg-accent font-semibold text-[#04201c]"
                : "bg-surface-2 text-dim hover:bg-[#18222c]")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
