import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reticle — Neuroimaging Viewer",
  description: "Browser-based NIfTI / DICOM viewer with 2D ortho and 3D volume rendering.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07090c",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="bg-bg text-fg flex min-h-full flex-col">{children}</body>
    </html>
  );
}
