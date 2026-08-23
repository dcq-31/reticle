"use client";

import { useMemo } from "react";

import { probe } from "@/lib/geometry/worldVoxel";
import { fmt } from "@/lib/utils/fmt";
import { useViewerStore } from "@/store";

export function StatusBar(): React.ReactElement {
  const base = useViewerStore((s) => s.base);
  const cross = useViewerStore((s) => s.cross);
  const hover = useViewerStore((s) => s.hover);
  const info = useMemo(() => {
    if (!base) return null;
    const v = base.volume;
    const r = hover?.r ?? cross.r;
    const a = hover?.a ?? cross.a;
    const s = hover?.s ?? cross.s;
    const p = probe(v, r, a, s, cross.t);
    return {
      voxel: p.voxel,
      world: p.world,
      value: p.value,
      orient: v.orientCode,
      dims: `${v.nx}×${v.ny}×${v.nz}${v.nt > 1 ? `×${v.nt}` : ""}`,
    };
  }, [base, cross, hover]);

  return (
    <footer
      className="bg-surface border-line flex flex-wrap items-center gap-x-0 gap-y-1 border-t px-2 py-1 font-mono text-[11px] md:h-[30px] md:py-0"
      aria-label="Volume status"
    >
      <Sb label="Voxel" value={info ? info.voxel.join("  ") : "— — —"} />
      <Sb
        label="World mm"
        value={info ? info.world.map((x) => x.toFixed(1)).join("  ") : "— — —"}
        className="max-md:hidden"
      />
      <Sb label="Value" value={info ? fmt(info.value) : "—"} valTone="hot" />
      <Sb label="Orient" value={info?.orient ?? "—"} className="max-sm:hidden" />
      <div className="flex-1" />
      <Sb label="Dims" value={info?.dims ?? "—"} />
    </footer>
  );
}

function Sb({
  label,
  value,
  valTone,
  className,
}: {
  readonly label: string;
  readonly value: string;
  readonly valTone?: "accent" | "hot";
  readonly className?: string;
}): React.ReactElement {
  const tone = valTone === "hot" ? "text-hot" : "text-accent";
  return (
    <div
      className={
        "border-line flex items-center gap-1.5 border-r px-2.5 whitespace-nowrap last:border-r-0 md:h-full md:px-3 " +
        (className ?? "")
      }
    >
      <span className="text-faint text-[9.5px] tracking-[0.1em] uppercase">{label}</span>
      <span className={tone}>{value}</span>
    </div>
  );
}
