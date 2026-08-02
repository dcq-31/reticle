"use client";

import { PanelGroup } from "@/components/controls/primitives";
import { fmt } from "@/lib/utils/fmt";
import { useViewerStore } from "@/store";

export function HeaderMeta(): React.ReactElement {
  const base = useViewerStore((s) => s.base);
  if (!base) {
    return (
      <PanelGroup title="Header">
        <p className="text-faint text-[10.5px] leading-relaxed">Load a volume to see metadata.</p>
      </PanelGroup>
    );
  }
  const v = base.volume;
  const details = v.details ?? {};
  const stats = v.stats;

  const rows: Array<readonly [string, string]> = [
    ["Format", details.Format ?? (v.source === "nifti" ? "NIfTI" : "DICOM")],
    ["Datatype", details.Datatype ?? v.datatype],
    ["Dimensions", `${v.nx} × ${v.ny} × ${v.nz}${v.nt > 1 ? ` × ${v.nt}` : ""}`],
    ["Voxel mm", v.spacing.map((x) => x.toFixed(2)).join(" × ")],
    ["Orient", `${v.orientCode} ${details.Orient ?? ""}`.trim()],
    ["Scaling", `× ${fmt(v.sclSlope)}  + ${fmt(v.sclInter)}`],
    ...(stats ? ([["Data range", `${fmt(stats.min)} … ${fmt(stats.max)}`]] as const) : []),
    ...(details.Endian ? ([["Endian", details.Endian]] as const) : []),
    ...(details.Descrip ? ([["Descrip", details.Descrip]] as const) : []),
  ];

  return (
    <PanelGroup title="Header">
      <dl className="text-dim space-y-0.75 font-mono text-[11px] leading-relaxed">
        {rows.map(([k, val]) => (
          <div key={k} className="flex gap-2">
            <dt className="text-faint w-22 flex-none">{k}</dt>
            <dd className="text-fg flex-1 wrap-break-word">{val}</dd>
          </div>
        ))}
      </dl>
    </PanelGroup>
  );
}
