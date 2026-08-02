"use client";

import dynamic from "next/dynamic";

const Viewer = dynamic(() => import("@/components/viewer/Viewer"), {
  ssr: false,
  loading: () => (
    <div className="text-dim flex flex-1 items-center justify-center font-mono text-xs">
      Loading viewer…
    </div>
  ),
});

export default function Page(): React.ReactElement {
  return <Viewer />;
}
